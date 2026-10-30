const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Driver = require('../models/Driver');

// ===== REGISTER DRIVER =====
router.post('/register', async (req, res) => {
  try {
    const { name, phone, password, tricycleNumber, totalSeats } = req.body;

    const existing = await Driver.findOne({ $or: [{ phone }, { tricycleNumber }] });
    if (existing) {
      return res.status(400).json({
        message: existing.phone === phone
          ? 'Phone number already registered'
          : 'Tricycle number already registered'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const driver = await Driver.create({
      name,
      phone,
      password: hashedPassword,
      tricycleNumber,
      totalSeats: totalSeats || 3,
      availableSeats: totalSeats || 3,
    });

    const token = jwt.sign(
      { id: driver._id, role: 'driver' },
      process.env.JWT_SECRET || 'uniweb_secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      driver: {
        _id: driver._id,
        name: driver.name,
        phone: driver.phone,
        tricycleNumber: driver.tricycleNumber,
        totalSeats: driver.totalSeats,
        availableSeats: driver.availableSeats,
        status: driver.status,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== LOGIN DRIVER =====
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    const driver = await Driver.findOne({ phone });
    if (!driver) return res.status(400).json({ message: 'Invalid phone or password' });

    const isMatch = await bcrypt.compare(password, driver.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid phone or password' });

    const token = jwt.sign(
      { id: driver._id, role: 'driver' },
      process.env.JWT_SECRET || 'uniweb_secret',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      driver: {
        _id: driver._id,
        name: driver.name,
        phone: driver.phone,
        tricycleNumber: driver.tricycleNumber,
        totalSeats: driver.totalSeats,
        availableSeats: driver.availableSeats,
        status: driver.status,
        isOnShift: driver.isOnShift,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== GET ALL ACTIVE DRIVERS (public — for students) =====
router.get('/active', async (req, res) => {
  try {
    const drivers = await Driver.find({
      isOnShift: true,
      status: { $ne: 'offline' },
    }).select('-password');
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== GET DRIVER PROFILE =====
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'uniweb_secret');
    if (decoded.role !== 'driver') return res.status(403).json({ message: 'Not a driver' });

    const driver = await Driver.findById(decoded.id).select('-password');
    if (!driver) return res.status(404).json({ message: 'Driver not found' });

    res.json(driver);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== UPDATE SEATS =====
router.put('/seats', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'uniweb_secret');
    const driver = await Driver.findById(decoded.id);
    if (!driver) return res.status(404).json({ message: 'Driver not found' });

    const { availableSeats } = req.body;
    driver.availableSeats = Math.max(0, Math.min(driver.totalSeats, availableSeats));
    driver.status = driver.availableSeats === 0 ? 'full' : 'active';
    await driver.save();

    // Broadcast update via Socket.IO
    const io = req.app.get('io');
    io.emit('driverUpdate', {
      driverId: driver._id,
      availableSeats: driver.availableSeats,
      totalSeats: driver.totalSeats,
      status: driver.status,
    });

    res.json(driver);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== START SHIFT =====
router.put('/start-shift', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'uniweb_secret');
    const driver = await Driver.findById(decoded.id);
    if (!driver) return res.status(404).json({ message: 'Driver not found' });

    driver.isOnShift = true;
    driver.status = 'active';
    driver.availableSeats = driver.totalSeats;
    await driver.save();

    const io = req.app.get('io');
    io.emit('driverOnline', {
      driverId: driver._id,
      name: driver.name,
      tricycleNumber: driver.tricycleNumber,
      totalSeats: driver.totalSeats,
      availableSeats: driver.availableSeats,
      status: driver.status,
    });

    res.json(driver);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== END SHIFT =====
router.put('/end-shift', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'uniweb_secret');
    const driver = await Driver.findById(decoded.id);
    if (!driver) return res.status(404).json({ message: 'Driver not found' });

    driver.isOnShift = false;
    driver.status = 'offline';
    driver.currentLocation = { lat: null, lng: null, updatedAt: null };
    await driver.save();

    const io = req.app.get('io');
    io.emit('driverOffline', { driverId: driver._id });

    res.json(driver);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;