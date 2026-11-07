// routes/driverRoutes.js  (mounted at /api/drivers)
//
// Driver side: registration, login, daily tricycle check-in, shifts, seats,
// announcements, and the public list of tricycles on the road.

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const Driver = require('../models/Driver');
const Vehicle = require('../models/Vehicle');
const CheckIn = require('../models/CheckIn');
const User = require('../models/user');
const FleetAnnouncement = require('../models/FleetAnnouncement');
const { driverAuth, requireApproved } = require('../middleware/driverAuth');
const { lagosDay, greeting } = require('../utils/fleetTime');
const { logAudit } = require('../utils/fleetAudit');
const rateLimit = require('../utils/rateLimit');

// ===== Helpers =====

// 08012345678, +2348012345678 and 234 801 234 5678 are the same number
function normalizePhone(p) {
  let s = String(p || '').replace(/[\s\-()]/g, '');
  if (s.startsWith('+234')) s = '0' + s.slice(4);
  else if (s.startsWith('234') && s.length === 13) s = '0' + s.slice(3);
  return s;
}
const PHONE_RE = /^0\d{10}$/;

const normalizeLicense = s => String(s || '').replace(/\s+/g, '').toUpperCase();

// Never send the password hash, or the reviewer's identity, to the driver
function publicDriver(d) {
  const o = d.toObject ? d.toObject() : { ...d };
  delete o.password;
  delete o.reviewedBy;
  return o;
}

const signToken = driver =>
  jwt.sign({ id: driver._id, role: 'driver' }, process.env.JWT_SECRET, { expiresIn: '7d' });

// ===== REGISTER =====
// The driver is created as "pending". They can sign in and see that they are
// waiting, but cannot work until a fleet admin approves them.
router.post('/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || '');
    const licenseNumber = normalizeLicense(req.body.licenseNumber);

    if (name.length < 2) return res.status(400).json({ message: 'Enter your full name' });
    if (!PHONE_RE.test(phone)) {
      return res.status(400).json({ message: 'Enter a valid 11-digit phone number, e.g. 08012345678' });
    }
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    if (licenseNumber.length < 5) return res.status(400).json({ message: 'Enter your driving licence number' });
    if (req.body.locationConsent !== true) {
      return res.status(400).json({ message: 'You must agree to share your location during your shift' });
    }

    // Phone and licence numbers are unique for good: a rejected applicant
    // cannot simply register again.
    const existing = await Driver.findOne({ $or: [{ phone }, { licenseNumber }] }).select('phone');
    if (existing) {
      return res.status(400).json({
        message:
          existing.phone === phone
            ? 'This phone number is already registered'
            : 'This licence number is already registered',
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const driver = await Driver.create({
      name,
      phone,
      password: hashedPassword,
      licenseNumber,
      locationConsent: true,
      consentAt: new Date(),
      accountStatus: 'pending',
    });

    await logAudit({
      action: 'driver.register',
      actor: { kind: 'driver', id: driver._id, name: driver.name },
      target: { kind: 'driver', id: driver._id, label: `${driver.name} (${driver.phone})` },
    });

    res.status(201).json({ token: signToken(driver), driver: publicDriver(driver) });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(400).json({ message: 'This phone or licence number is already registered' });
    }
    console.error('Driver register error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== LOGIN =====
router.post('/login', async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || '');

    const driver = await Driver.findOne({ phone });
    if (!driver) return res.status(400).json({ message: 'Invalid phone or password' });

    const isMatch = await bcrypt.compare(password, driver.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid phone or password' });

    res.json({ token: signToken(driver), driver: publicDriver(driver) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== MY PROFILE (any status, so pending/rejected/suspended drivers can see why) =====
router.get('/me', driverAuth, async (req, res) => {
  const today = lagosDay();
  res.json({
    ...publicDriver(req.driver),
    today,
    greeting: greeting(),
    checkedInToday: req.driver.checkedInDay === today,
    needsConsent: !req.driver.locationConsent,
  });
});

// Existing drivers (registered before consent was collected) agree here
router.put('/consent', driverAuth, async (req, res) => {
  if (req.body.consent !== true) {
    return res.status(400).json({ message: 'You must agree to share your location during your shift' });
  }
  await Driver.updateOne({ _id: req.driver._id }, { $set: { locationConsent: true, consentAt: new Date() } });
  res.json({ message: 'Thank you' });
});

// ===== TODAY: greeting, today's tricycle, and the tricycles still free =====
router.get('/today', driverAuth, requireApproved, async (req, res) => {
  try {
    const day = lagosDay();
    const [mine, takenToday, vehicles] = await Promise.all([
      CheckIn.findOne({ day, driver: req.driver._id }).populate('vehicle', 'number plate seats status'),
      CheckIn.find({ day }).select('vehicle').lean(),
      Vehicle.find({ status: 'available' }).sort({ number: 1 }).lean(),
    ]);
    const taken = new Set(takenToday.map(c => String(c.vehicle)));

    res.json({
      day,
      greeting: greeting(),
      name: req.driver.name,
      checkIn: mine,
      vehicles: mine ? [] : vehicles.filter(v => !taken.has(String(v._id))),
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== CHECK IN: pick today's tricycle (once per day) =====
router.post('/check-in', driverAuth, requireApproved, async (req, res) => {
  try {
    const day = lagosDay();

    const already = await CheckIn.findOne({ day, driver: req.driver._id });
    if (already) {
      return res.status(409).json({
        message: `You already checked in today with ${already.vehicleNumber}. Ask a fleet admin if you need to change it.`,
        checkIn: already,
      });
    }

    const vehicle = await Vehicle.findById(req.body.vehicleId).catch(() => null);
    if (!vehicle) return res.status(404).json({ message: 'Tricycle not found' });
    if (vehicle.status !== 'available') {
      return res.status(400).json({ message: `${vehicle.number} is not available right now` });
    }

    let checkIn;
    try {
      checkIn = await CheckIn.create({
        day,
        driver: req.driver._id,
        vehicle: vehicle._id,
        driverName: req.driver.name,
        vehicleNumber: vehicle.number,
      });
    } catch (err) {
      if (err && err.code === 11000) {
        // The unique indexes decide races: either this tricycle was just taken,
        // or this driver double-tapped.
        return res.status(409).json({
          message: `${vehicle.number} was just taken by another driver. Please pick a different tricycle.`,
        });
      }
      throw err;
    }

    await Driver.updateOne(
      { _id: req.driver._id },
      {
        $set: {
          currentVehicle: vehicle._id,
          checkedInDay: day,
          tricycleNumber: vehicle.number,
          totalSeats: vehicle.seats,
          availableSeats: vehicle.seats,
        },
      }
    );

    await logAudit({
      action: 'driver.checkin',
      actor: { kind: 'driver', id: req.driver._id, name: req.driver.name },
      target: { kind: 'driver', id: req.driver._id, label: `${req.driver.name} (${req.driver.phone})` },
      details: { vehicle: vehicle.number, day },
    });

    res.status(201).json({ checkIn });
  } catch (err) {
    console.error('Check-in error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== START SHIFT =====
router.put('/start-shift', driverAuth, requireApproved, async (req, res) => {
  try {
    const driver = req.driver;

    if (!driver.locationConsent) {
      return res.status(400).json({ message: 'Please agree to share your location first', needsConsent: true });
    }
    if (driver.checkedInDay !== lagosDay()) {
      return res.status(400).json({ message: 'Pick your tricycle for today first', needsCheckIn: true });
    }

    const updated = await Driver.findByIdAndUpdate(
      driver._id,
      { $set: { isOnShift: true, status: 'active', availableSeats: driver.totalSeats } },
      { new: true }
    ).select('-password -reviewedBy');

    req.app.get('io').emit('driverOnline', {
      driverId: String(updated._id),
      name: updated.name,
      tricycleNumber: updated.tricycleNumber,
      totalSeats: updated.totalSeats,
      availableSeats: updated.availableSeats,
      status: updated.status,
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== END SHIFT =====
router.put('/end-shift', driverAuth, async (req, res) => {
  try {
    const updated = await Driver.findByIdAndUpdate(
      req.driver._id,
      {
        $set: {
          isOnShift: false,
          status: 'offline',
          'currentLocation.lat': null,
          'currentLocation.lng': null,
          'currentLocation.updatedAt': null,
        },
      },
      { new: true }
    ).select('-password -reviewedBy');

    req.app.get('io').emit('driverOffline', { driverId: String(req.driver._id) });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== UPDATE SEATS =====
router.put('/seats', driverAuth, requireApproved, async (req, res) => {
  try {
    const driver = req.driver;
    if (!driver.isOnShift) return res.status(400).json({ message: 'Start your shift first' });

    const requested = Number(req.body.availableSeats);
    if (!Number.isInteger(requested)) return res.status(400).json({ message: 'Seats must be a whole number' });

    const availableSeats = Math.max(0, Math.min(driver.totalSeats, requested));
    const status = availableSeats === 0 ? 'full' : 'active';

    const updated = await Driver.findByIdAndUpdate(
      driver._id,
      { $set: { availableSeats, status } },
      { new: true }
    ).select('-password -reviewedBy');

    req.app.get('io').emit('driverUpdate', {
      driverId: String(driver._id),
      availableSeats,
      totalSeats: driver.totalSeats,
      status,
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== ANNOUNCEMENTS FOR ME =====
router.get('/announcements', driverAuth, async (req, res) => {
  try {
    if (req.driver.accountStatus !== 'approved') return res.json([]);
    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);
    const list = await FleetAnnouncement.find({
      createdAt: { $gte: since },
      $or: [{ audience: { $in: ['all', 'onShift'] } }, { targetDriver: req.driver._id }],
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    res.json(
      list.map(a => ({
        _id: a._id,
        title: a.title,
        body: a.body,
        urgent: a.urgent,
        createdAt: a.createdAt,
        from: a.createdBy && a.createdBy.name,
        read: (a.readBy || []).some(id => String(id) === String(req.driver._id)),
      }))
    );
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/announcements/:id/read', driverAuth, async (req, res) => {
  try {
    await FleetAnnouncement.updateOne({ _id: req.params.id }, { $addToSet: { readBy: req.driver._id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ message: 'Invalid announcement' });
  }
});

// ===== PUBLIC: tricycles on the road =====
// Anyone can call this (guests included), so it returns the minimum: only
// approved drivers on shift with a fresh location, no phone numbers, and the
// driver's name only for a signed-in UniWeb user.
async function viewerIsSignedIn(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return false;
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role === 'driver') return false;
    return !!(await User.exists({ _id: decoded.id }));
  } catch (err) {
    return false;
  }
}

// Campus Wi-Fi often puts many people behind one address, so the limit is generous
const activeLimiter = rateLimit({ windowMs: 60 * 1000, max: 600 });

router.get('/active', activeLimiter, async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    const signedIn = await viewerIsSignedIn(req);

    const drivers = await Driver.find({
      accountStatus: 'approved',
      isOnShift: true,
      status: { $ne: 'offline' },
      'currentLocation.lat': { $ne: null },
      'currentLocation.updatedAt': { $gte: cutoff },
    }).select(`tricycleNumber totalSeats availableSeats status currentLocation${signedIn ? ' name' : ''}`);

    res.json(drivers);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;