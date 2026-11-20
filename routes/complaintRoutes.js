// routes/complaintRoutes.js  (mounted at /api/complaints)
//
// The student side: report a problem with a tricycle, and follow your reports.
// Any signed-in UniWeb user may report. Fleet admins handle reports through
// /api/fleet/complaints.

const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const Complaint = require('../models/Complaint');
const Vehicle = require('../models/Vehicle');
const CheckIn = require('../models/CheckIn');
const { CATEGORIES } = require('../utils/complaintCategories');
const { lagosDay } = require('../utils/fleetTime');

// What the form needs: the report types and the tricycle numbers
router.get('/options', auth, async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ status: { $ne: 'retired' } }).sort({ number: 1 }).select('number').lean();
    res.json({
      categories: Object.entries(CATEGORIES).map(([key, c]) => ({ key, label: c.label })),
      vehicles: vehicles.map(v => v.number),
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// File a report
router.post('/', auth, async (req, res) => {
  try {
    const { category, when = 'today' } = req.body || {};
    const message = String((req.body || {}).message || '').trim();
    const vehicleNumber = String((req.body || {}).vehicleNumber || '').trim().toUpperCase();

    if (!CATEGORIES[category]) return res.status(400).json({ message: 'Choose what the problem is about' });
    if (!['today', 'yesterday', 'earlier'].includes(when)) return res.status(400).json({ message: 'Choose when it happened' });
    if (message.length < 10) return res.status(400).json({ message: 'Please describe what happened (at least 10 characters)' });
    if (message.length > 1000) return res.status(400).json({ message: 'Please keep it under 1000 characters' });

    // A few a day is plenty. This stops a flood.
    const recent = await Complaint.countDocuments({
      reporter: req.user._id,
      createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) },
    });
    if (recent >= 5) return res.status(429).json({ message: 'You have sent several reports today. Please try again tomorrow.' });

    // Link the driver who had that tricycle on that day, when we know it
    let driver = null;
    let driverName = '';
    if (vehicleNumber) {
      const vehicle = await Vehicle.findOne({ number: vehicleNumber });
      if (!vehicle) return res.status(400).json({ message: 'That tricycle number is not on the list' });
      if (when !== 'earlier') {
        const day = lagosDay(when === 'yesterday' ? -1 : 0);
        const checkIn = await CheckIn.findOne({ day, vehicle: vehicle._id });
        if (checkIn) {
          driver = checkIn.driver;
          driverName = checkIn.driverName;
        }
      }
    }

    const priority = CATEGORIES[category].priority;
    const complaint = await Complaint.create({
      reporter: req.user._id,
      reporterName: req.user.name || '',
      reporterEmail: req.user.email || '',
      reporterPhone: req.user.phone || '',
      vehicleNumber,
      when,
      driver,
      driverName,
      category,
      priority,
      message,
    });

    // Tells the fleet portal there is something new (no details in the message)
    req.app.get('io').to('fleet_admins').emit('complaintNew', { _id: complaint._id, category, priority });

    res.status(201).json({ complaint: { _id: complaint._id, status: complaint.status } });
  } catch (err) {
    console.error('Complaint error:', err.message);
    res.status(500).json({ message: 'Could not send your report. Please try again.' });
  }
});

// My own reports and what became of them (internal notes are never included)
router.get('/mine', auth, async (req, res) => {
  try {
    const list = await Complaint.find({ reporter: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .select('category vehicleNumber message status resolution createdAt updatedAt')
      .lean();
    res.json(list.map(c => ({ ...c, categoryLabel: CATEGORIES[c.category]?.label || c.category })));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;