// routes/fleetRoutes.js
//
// Fleet portal API (mounted at /api/fleet).
//
//   Super Admin only : appoint / remove the Fleet Head
//   Fleet portal     : drivers, approvals, suspensions, fleet admins, the
//                      tricycle roster, daily check-ins, announcements,
//                      live view and the audit log
//
// Every fleet action is written to the audit log.

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const { fleetAuth, requireHead } = require('../middleware/fleetAuth');
const User = require('../models/user');
const Driver = require('../models/Driver');
const Vehicle = require('../models/Vehicle');
const CheckIn = require('../models/CheckIn');
const FleetAudit = require('../models/FleetAudit');
const FleetAnnouncement = require('../models/FleetAnnouncement');
const { logAudit } = require('../utils/fleetAudit');
const { lagosDay } = require('../utils/fleetTime');

// ===== Helpers =====
const isId = v => mongoose.isValidObjectId(v);
const sameId = (a, b) => String(a) === String(b);
const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const actorRef = req => ({ kind: req.fleetActor.kind, id: req.fleetActor.id, name: req.fleetActor.name });
const driverLabel = d => ({ kind: 'driver', id: d._id, label: `${d.name} (${d.phone})` });
const DRIVER_STATUSES = ['pending', 'approved', 'rejected', 'suspended'];

async function getTarget(req, res) {
  if (!isId(req.params.id)) {
    res.status(400).json({ message: 'Invalid driver id' });
    return null;
  }
  const driver = await Driver.findById(req.params.id).select('-password');
  if (!driver) {
    res.status(404).json({ message: 'Driver not found' });
    return null;
  }
  return driver;
}

// Guardrails for actions on a driver:
//  - nobody acts on their own account
//  - only the head may act on a fleet admin
function allowedOn(req, res, driver) {
  if (req.fleetActor.kind === 'admin' && sameId(driver._id, req.fleetActor.id)) {
    res.status(403).json({ message: 'You cannot do that to your own account' });
    return false;
  }
  if (driver.isFleetAdmin && !req.fleetActor.isHead) {
    res.status(403).json({ message: 'Only the Fleet Head can change a fleet admin' });
    return false;
  }
  return true;
}

// Take a driver off shift and tell every connected screen
async function takeOffShift(io, driverId) {
  await Driver.updateOne(
    { _id: driverId },
    {
      $set: {
        isOnShift: false,
        status: 'offline',
        'currentLocation.lat': null,
        'currentLocation.lng': null,
        'currentLocation.updatedAt': null,
      },
    }
  );
  io.emit('driverOffline', { driverId: String(driverId) });
}

function tellDriver(io, driverId, event, payload) {
  io.to(`driver_${driverId}`).emit(event, payload);
}

function dropFromAdminRoom(io, driverId) {
  try {
    io.in(`driver_${driverId}`).socketsLeave('fleet_admins');
  } catch (e) {
    /* older socket.io: harmless, the next connection will not join */
  }
}

// =====================================================================
//  SUPER ADMIN: appoint / remove the Fleet Head
// =====================================================================
const saRef = req => ({ kind: 'superadmin', id: req.user._id, name: req.user.name });

router.get('/head', auth, authorizeRole('admin'), async (req, res) => {
  try {
    const head = await User.findOne({ isFleetHead: true }).select(
      'name email faculty department avatarColor'
    );
    res.json(head || null);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Replaces the current head, if any. Only a lecturer can be appointed.
router.put('/head/:userId', auth, authorizeRole('admin'), async (req, res) => {
  try {
    if (!isId(req.params.userId)) return res.status(400).json({ message: 'Invalid user id' });
    const user = await User.findById(req.params.userId).select('name role isFleetHead');
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role !== 'lecturer') {
      return res.status(400).json({ message: 'Only a lecturer can be appointed Fleet Head' });
    }
    if (user.isFleetHead) {
      return res.json({ message: `${user.name} is already the Fleet Head` });
    }

    const previous = await User.findOne({ isFleetHead: true }).select('name');

    // Clear the old head first so the one-head-only index is never violated
    await User.updateMany({ isFleetHead: true }, { $set: { isFleetHead: false } });
    await User.updateOne({ _id: user._id }, { $set: { isFleetHead: true } });

    await logAudit({
      action: 'head.appoint',
      actor: saRef(req),
      target: { kind: 'user', id: user._id, label: user.name },
      details: previous ? { replaced: previous.name } : null,
    });

    res.json({ message: `${user.name} is now the Fleet Head` });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'Another Fleet Head was just appointed. Refresh and try again.' });
    }
    console.error('Appoint fleet head error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/head', auth, authorizeRole('admin'), async (req, res) => {
  try {
    const previous = await User.findOne({ isFleetHead: true }).select('name');
    await User.updateMany({ isFleetHead: true }, { $set: { isFleetHead: false } });
    if (previous) {
      await logAudit({
        action: 'head.remove',
        actor: saRef(req),
        target: { kind: 'user', id: previous._id, label: previous.name },
      });
    }
    res.json({ message: 'Fleet Head removed' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// =====================================================================
//  FLEET PORTAL (Fleet Head and fleet admins)
// =====================================================================

// ----- Who am I, and the numbers for the dashboard -----
router.get('/me', fleetAuth, async (req, res) => {
  try {
    const [pending, approved, suspended, onShift, vehicles] = await Promise.all([
      Driver.countDocuments({ accountStatus: 'pending' }),
      Driver.countDocuments({ accountStatus: 'approved' }),
      Driver.countDocuments({ accountStatus: 'suspended' }),
      Driver.countDocuments({ accountStatus: 'approved', isOnShift: true }),
      Vehicle.countDocuments({ status: 'available' }),
    ]);
    res.json({
      actor: { kind: req.fleetActor.kind, name: req.fleetActor.name, isHead: req.fleetActor.isHead },
      today: lagosDay(),
      counts: { pending, approved, suspended, onShift, vehicles },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----- Drivers -----
router.get('/drivers', fleetAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status && DRIVER_STATUSES.includes(req.query.status)) {
      filter.accountStatus = req.query.status;
    }
    if (req.query.admins === 'true') filter.isFleetAdmin = true;
    if (req.query.q) {
      const rx = new RegExp(escapeRegex(clean(req.query.q, 60)), 'i');
      filter.$or = [{ name: rx }, { phone: rx }, { licenseNumber: rx }, { tricycleNumber: rx }];
    }

    const today = lagosDay();
    const drivers = await Driver.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(300)
      .lean();

    res.json(
      drivers.map(d => ({
        ...d,
        todayVehicle: d.checkedInDay === today ? d.tricycleNumber : null,
      }))
    );
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/drivers/:id', fleetAuth, async (req, res) => {
  try {
    const driver = await getTarget(req, res);
    if (!driver) return;

    const [history, checkIns] = await Promise.all([
      FleetAudit.find({ 'target.id': driver._id }).sort({ createdAt: -1 }).limit(30).lean(),
      CheckIn.find({ driver: driver._id }).sort({ day: -1 }).limit(14).lean(),
    ]);

    res.json({ driver, history, checkIns });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Approve a pending (or previously rejected) application
router.put('/drivers/:id/approve', fleetAuth, async (req, res) => {
  try {
    const driver = await getTarget(req, res);
    if (!driver) return;
    if (!allowedOn(req, res, driver)) return;
    if (!['pending', 'rejected'].includes(driver.accountStatus)) {
      return res.status(400).json({ message: 'Only pending or rejected applications can be approved' });
    }
    if (!driver.licenseNumber) {
      return res.status(400).json({ message: 'This driver has no licence number on file' });
    }

    await Driver.updateOne(
      { _id: driver._id },
      { $set: { accountStatus: 'approved', statusReason: null, reviewedBy: actorRef(req), reviewedAt: new Date() } }
    );
    await logAudit({ action: 'driver.approve', actor: actorRef(req), target: driverLabel(driver) });

    const io = req.app.get('io');
    // Their open app can now receive fleet messages without reconnecting
    try { io.in(`driver_${driver._id}`).socketsJoin('fleet_drivers'); } catch (e) { /* older socket.io */ }
    tellDriver(io, driver._id, 'accountStatusChanged', { accountStatus: 'approved' });
    res.json({ message: `${driver.name} approved` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/drivers/:id/reject', fleetAuth, async (req, res) => {
  try {
    const driver = await getTarget(req, res);
    if (!driver) return;
    if (!allowedOn(req, res, driver)) return;
    if (driver.accountStatus !== 'pending') {
      return res.status(400).json({ message: 'Only pending applications can be rejected' });
    }
    const reason = clean(req.body.reason, 300);
    if (reason.length < 3) return res.status(400).json({ message: 'A reason is required' });

    await Driver.updateOne(
      { _id: driver._id },
      { $set: { accountStatus: 'rejected', statusReason: reason, reviewedBy: actorRef(req), reviewedAt: new Date() } }
    );
    await logAudit({ action: 'driver.reject', actor: actorRef(req), target: driverLabel(driver), details: { reason } });

    tellDriver(req.app.get('io'), driver._id, 'accountStatusChanged', { accountStatus: 'rejected', reason });
    res.json({ message: `${driver.name} rejected` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Suspend: ends the shift, frees today's tricycle and hides the driver everywhere
router.put('/drivers/:id/suspend', fleetAuth, async (req, res) => {
  try {
    const driver = await getTarget(req, res);
    if (!driver) return;
    if (!allowedOn(req, res, driver)) return;
    if (driver.accountStatus !== 'approved') {
      return res.status(400).json({ message: 'Only approved drivers can be suspended' });
    }
    const reason = clean(req.body.reason, 300);
    if (reason.length < 3) return res.status(400).json({ message: 'A reason is required' });

    const io = req.app.get('io');
    await Driver.updateOne(
      { _id: driver._id },
      {
        $set: {
          accountStatus: 'suspended',
          statusReason: reason,
          reviewedBy: actorRef(req),
          reviewedAt: new Date(),
          currentVehicle: null,
          checkedInDay: null,
        },
      }
    );
    await takeOffShift(io, driver._id);
    await CheckIn.deleteMany({ day: lagosDay(), driver: driver._id });
    dropFromAdminRoom(io, driver._id);

    await logAudit({ action: 'driver.suspend', actor: actorRef(req), target: driverLabel(driver), details: { reason } });
    tellDriver(io, driver._id, 'accountStatusChanged', { accountStatus: 'suspended', reason });
    res.json({ message: `${driver.name} suspended` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/drivers/:id/reinstate', fleetAuth, async (req, res) => {
  try {
    const driver = await getTarget(req, res);
    if (!driver) return;
    if (!allowedOn(req, res, driver)) return;
    if (driver.accountStatus !== 'suspended') {
      return res.status(400).json({ message: 'Only suspended drivers can be reinstated' });
    }

    await Driver.updateOne(
      { _id: driver._id },
      { $set: { accountStatus: 'approved', statusReason: null, reviewedBy: actorRef(req), reviewedAt: new Date() } }
    );
    await logAudit({ action: 'driver.reinstate', actor: actorRef(req), target: driverLabel(driver) });

    const io = req.app.get('io');
    try { io.in(`driver_${driver._id}`).socketsJoin('fleet_drivers'); } catch (e) { /* older socket.io */ }
    tellDriver(io, driver._id, 'accountStatusChanged', { accountStatus: 'approved' });
    res.json({ message: `${driver.name} reinstated` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----- Fleet admins (Fleet Head only) -----
router.put('/drivers/:id/make-admin', fleetAuth, requireHead, async (req, res) => {
  try {
    const driver = await getTarget(req, res);
    if (!driver) return;
    if (driver.accountStatus !== 'approved') {
      return res.status(400).json({ message: 'Only approved drivers can be made fleet admins' });
    }
    if (driver.isFleetAdmin) return res.json({ message: `${driver.name} is already a fleet admin` });

    await Driver.updateOne({ _id: driver._id }, { $set: { isFleetAdmin: true } });
    await logAudit({ action: 'admin.add', actor: actorRef(req), target: driverLabel(driver) });

    const io = req.app.get('io');
    try { io.in(`driver_${driver._id}`).socketsJoin('fleet_admins'); } catch (e) { /* older socket.io */ }
    tellDriver(io, driver._id, 'accountStatusChanged', { accountStatus: 'approved', isFleetAdmin: true });
    res.json({ message: `${driver.name} is now a fleet admin` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/drivers/:id/remove-admin', fleetAuth, requireHead, async (req, res) => {
  try {
    const driver = await getTarget(req, res);
    if (!driver) return;
    if (!driver.isFleetAdmin) return res.json({ message: `${driver.name} is not a fleet admin` });

    const io = req.app.get('io');
    await Driver.updateOne({ _id: driver._id }, { $set: { isFleetAdmin: false } });
    dropFromAdminRoom(io, driver._id);
    await logAudit({ action: 'admin.remove', actor: actorRef(req), target: driverLabel(driver) });

    tellDriver(io, driver._id, 'accountStatusChanged', { accountStatus: 'approved', isFleetAdmin: false });
    res.json({ message: `${driver.name} is no longer a fleet admin` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----- Reassign a driver's tricycle for today -----
router.put('/drivers/:id/vehicle', fleetAuth, async (req, res) => {
  try {
    const driver = await getTarget(req, res);
    if (!driver) return;
    if (!allowedOn(req, res, driver)) return;
    if (driver.accountStatus !== 'approved') {
      return res.status(400).json({ message: 'Only approved drivers can be assigned a tricycle' });
    }
    if (!isId(req.body.vehicleId)) return res.status(400).json({ message: 'Choose a tricycle' });

    const vehicle = await Vehicle.findById(req.body.vehicleId);
    if (!vehicle) return res.status(404).json({ message: 'Tricycle not found' });
    if (vehicle.status !== 'available') {
      return res.status(400).json({ message: `${vehicle.number} is not available (${vehicle.status})` });
    }

    const day = lagosDay();
    const held = await CheckIn.findOne({ day, vehicle: vehicle._id });
    if (held && !sameId(held.driver, driver._id)) {
      return res.status(409).json({ message: `${vehicle.number} is already assigned to ${held.driverName} today` });
    }

    await CheckIn.deleteMany({ day, driver: driver._id });
    try {
      await CheckIn.create({
        day,
        driver: driver._id,
        vehicle: vehicle._id,
        driverName: driver.name,
        vehicleNumber: vehicle.number,
      });
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ message: `${vehicle.number} was just taken. Pick another.` });
      }
      throw err;
    }

    const seatsNow = driver.isOnShift ? Math.min(driver.availableSeats, vehicle.seats) : vehicle.seats;
    await Driver.updateOne(
      { _id: driver._id },
      {
        $set: {
          currentVehicle: vehicle._id,
          checkedInDay: day,
          tricycleNumber: vehicle.number,
          totalSeats: vehicle.seats,
          availableSeats: seatsNow,
        },
      }
    );

    const io = req.app.get('io');
    // Students' screens reload the list when someone "comes online"
    if (driver.isOnShift) io.emit('driverOnline', { driverId: String(driver._id) });
    tellDriver(io, driver._id, 'vehicleReassigned', { tricycleNumber: vehicle.number, totalSeats: vehicle.seats });

    await logAudit({
      action: 'driver.reassign',
      actor: actorRef(req),
      target: driverLabel(driver),
      details: { vehicle: vehicle.number },
    });
    res.json({ message: `${driver.name} is now on ${vehicle.number} today` });
  } catch (err) {
    console.error('Reassign error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ----- Tricycle roster -----
router.get('/vehicles', fleetAuth, async (req, res) => {
  try {
    const day = lagosDay();
    const [vehicles, checkIns] = await Promise.all([
      Vehicle.find().sort({ number: 1 }).lean(),
      CheckIn.find({ day }).lean(),
    ]);
    const holders = new Map(checkIns.map(c => [String(c.vehicle), c.driverName]));
    res.json(vehicles.map(v => ({ ...v, heldBy: holders.get(String(v._id)) || null })));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/vehicles', fleetAuth, async (req, res) => {
  try {
    const number = clean(req.body.number, 20).toUpperCase();
    if (!number) return res.status(400).json({ message: 'Tricycle number is required' });
    const seats = Number(req.body.seats == null ? 3 : req.body.seats);
    if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
      return res.status(400).json({ message: 'Seats must be a whole number from 1 to 8' });
    }

    const vehicle = await Vehicle.create({
      number,
      plate: clean(req.body.plate, 20),
      seats,
      notes: clean(req.body.notes, 300),
    });
    await logAudit({
      action: 'vehicle.create',
      actor: actorRef(req),
      target: { kind: 'vehicle', id: vehicle._id, label: vehicle.number },
    });
    res.status(201).json(vehicle);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'That tricycle number already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/vehicles/:id', fleetAuth, async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: 'Tricycle not found' });

    const update = {};
    if (req.body.number !== undefined) {
      const number = clean(req.body.number, 20).toUpperCase();
      if (!number) return res.status(400).json({ message: 'Tricycle number is required' });
      update.number = number;
    }
    if (req.body.plate !== undefined) update.plate = clean(req.body.plate, 20).toUpperCase();
    if (req.body.notes !== undefined) update.notes = clean(req.body.notes, 300);
    if (req.body.seats !== undefined) {
      const seats = Number(req.body.seats);
      if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
        return res.status(400).json({ message: 'Seats must be a whole number from 1 to 8' });
      }
      update.seats = seats;
    }
    if (req.body.status !== undefined) {
      if (!['available', 'maintenance', 'retired'].includes(req.body.status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      update.status = req.body.status;
    }

    // A tricycle someone is using today cannot be taken out of service until
    // an admin releases it from that driver.
    if (update.status && update.status !== 'available') {
      const inUse = await CheckIn.findOne({ day: lagosDay(), vehicle: vehicle._id });
      if (inUse) {
        return res.status(409).json({
          message: `${vehicle.number} is in use today by ${inUse.driverName}. Release it first.`,
        });
      }
    }

    Object.assign(vehicle, update);
    await vehicle.save();

    // Keep today's snapshot on drivers in step with the roster
    const day = lagosDay();
    if (update.number) {
      await Driver.updateMany({ currentVehicle: vehicle._id, checkedInDay: day }, { $set: { tricycleNumber: vehicle.number } });
      await CheckIn.updateMany({ day, vehicle: vehicle._id }, { $set: { vehicleNumber: vehicle.number } });
    }
    if (update.seats) {
      await Driver.updateMany({ currentVehicle: vehicle._id, checkedInDay: day }, { $set: { totalSeats: vehicle.seats } });
      await Driver.updateMany(
        { currentVehicle: vehicle._id, checkedInDay: day, availableSeats: { $gt: vehicle.seats } },
        { $set: { availableSeats: vehicle.seats } }
      );
    }

    await logAudit({
      action: 'vehicle.update',
      actor: actorRef(req),
      target: { kind: 'vehicle', id: vehicle._id, label: vehicle.number },
      details: update,
    });
    res.json(vehicle);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'That tricycle number already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Only a tricycle that was never used can be deleted; otherwise retire it
router.delete('/vehicles/:id', fleetAuth, async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: 'Tricycle not found' });

    const used = await CheckIn.exists({ vehicle: vehicle._id });
    if (used) {
      return res.status(409).json({ message: 'This tricycle has history. Mark it retired instead of deleting it.' });
    }
    await Vehicle.deleteOne({ _id: vehicle._id });
    await logAudit({
      action: 'vehicle.delete',
      actor: actorRef(req),
      target: { kind: 'vehicle', id: vehicle._id, label: vehicle.number },
    });
    res.json({ message: 'Tricycle deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----- Daily check-ins -----
router.get('/checkins', fleetAuth, async (req, res) => {
  try {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(req.query.day || '') ? req.query.day : lagosDay();
    const list = await CheckIn.find({ day }).sort({ checkedInAt: 1 }).lean();
    res.json({ day, checkIns: list });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Release a driver's tricycle (they must check in again)
router.delete('/checkins/:id', fleetAuth, async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const checkIn = await CheckIn.findById(req.params.id);
    if (!checkIn) return res.status(404).json({ message: 'Check-in not found' });

    const driver = await Driver.findById(checkIn.driver).select('name phone isFleetAdmin isOnShift');
    if (driver && !allowedOn(req, res, driver)) return;

    const io = req.app.get('io');
    await CheckIn.deleteOne({ _id: checkIn._id });
    if (driver) {
      await Driver.updateOne({ _id: driver._id }, { $set: { currentVehicle: null, checkedInDay: null } });
      if (driver.isOnShift) await takeOffShift(io, driver._id);
      tellDriver(io, driver._id, 'checkInReleased', { vehicleNumber: checkIn.vehicleNumber });
    }

    await logAudit({
      action: 'checkin.release',
      actor: actorRef(req),
      target: driver ? driverLabel(driver) : { kind: 'driver', id: checkIn.driver, label: checkIn.driverName },
      details: { vehicle: checkIn.vehicleNumber, day: checkIn.day },
    });
    res.json({ message: `${checkIn.vehicleNumber} released` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----- Announcements to drivers -----
router.post('/announcements', fleetAuth, async (req, res) => {
  try {
    const title = clean(req.body.title, 100);
    const body = clean(req.body.body, 1000);
    const urgent = !!req.body.urgent;
    const audience = req.body.audience;

    if (!title || !body) return res.status(400).json({ message: 'Title and message are required' });
    if (!['all', 'onShift', 'driver'].includes(audience)) {
      return res.status(400).json({ message: 'Choose who should receive this' });
    }

    const io = req.app.get('io');
    let recipients = [];
    let targetDriver = null;

    if (audience === 'driver') {
      if (!isId(req.body.driverId)) return res.status(400).json({ message: 'Choose a driver' });
      const d = await Driver.findOne({ _id: req.body.driverId, accountStatus: 'approved' }).select('_id');
      if (!d) return res.status(404).json({ message: 'Approved driver not found' });
      recipients = [d._id];
      targetDriver = d._id;
    } else if (audience === 'onShift') {
      recipients = (await Driver.find({ accountStatus: 'approved', isOnShift: true }).select('_id')).map(d => d._id);
    } else {
      recipients = (await Driver.find({ accountStatus: 'approved' }).select('_id')).map(d => d._id);
    }

    const announcement = await FleetAnnouncement.create({
      title,
      body,
      urgent,
      audience,
      targetDriver,
      createdBy: actorRef(req),
      recipientCount: recipients.length,
    });

    const payload = {
      _id: announcement._id,
      title,
      body,
      urgent,
      createdAt: announcement.createdAt,
      from: req.fleetActor.name,
    };
    recipients.forEach(id => tellDriver(io, id, 'fleetAnnouncement', payload));

    await logAudit({
      action: 'announcement.send',
      actor: actorRef(req),
      details: { title, audience, urgent, recipients: recipients.length },
    });
    res.status(201).json(announcement);
  } catch (err) {
    console.error('Announcement error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/announcements', fleetAuth, async (req, res) => {
  try {
    const list = await FleetAnnouncement.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json(list.map(a => ({ ...a, readCount: (a.readBy || []).length, readBy: undefined })));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----- Live fleet view -----
router.get('/live', fleetAuth, async (req, res) => {
  try {
    const drivers = await Driver.find({ accountStatus: 'approved', isOnShift: true })
      .select('name phone tricycleNumber totalSeats availableSeats status currentLocation')
      .lean();
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----- Audit log -----
router.get('/audit', fleetAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const filter = {};
    if (req.query.before && !Number.isNaN(Date.parse(req.query.before))) {
      filter.createdAt = { $lt: new Date(req.query.before) };
    }
    const entries = await FleetAudit.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(entries);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;