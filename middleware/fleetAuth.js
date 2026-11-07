// middleware/fleetAuth.js
// Authentication for the fleet portal. Two kinds of people may use it:
//
//   head       a UniWeb user flagged isFleetHead (signs in with a normal
//              UniWeb token). Also covers the Super Admin as a backup.
//   admin      a driver flagged isFleetAdmin who is approved (signs in with a
//              driver token). Has no UniWeb account at all.
//
// On success req.fleetActor = { kind, id, name, isHead }.
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const Driver = require('../models/Driver');

const fleetAuth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);

    // ----- Fleet admin (a driver) -----
    if (decoded.role === 'driver') {
      const driver = await Driver.findById(decoded.id).select('name accountStatus isFleetAdmin');
      if (!driver) return res.status(401).json({ message: 'Not authorized' });
      if (driver.accountStatus !== 'approved' || !driver.isFleetAdmin) {
        return res.status(403).json({ message: 'Fleet admin access required' });
      }
      req.fleetActor = { kind: 'admin', id: driver._id, name: driver.name, isHead: false };
      return next();
    }

    // ----- Fleet Head (a UniWeb user) -----
    const user = await User.findById(decoded.id).select('name role isFleetHead');
    if (!user) return res.status(401).json({ message: 'Not authorized' });

    if (user.isFleetHead) {
      req.fleetActor = { kind: 'head', id: user._id, name: user.name, isHead: true };
      return next();
    }
    // Super Admin as a backup, with head-level powers
    if (user.role === 'admin') {
      req.fleetActor = { kind: 'superadmin', id: user._id, name: user.name, isHead: true };
      return next();
    }

    return res.status(403).json({ message: 'Fleet access required' });
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

// Actions only the Fleet Head (or Super Admin) may take, such as appointing
// or removing fleet admins.
const requireHead = (req, res, next) => {
  if (req.fleetActor && req.fleetActor.isHead) return next();
  return res.status(403).json({ message: 'Only the Fleet Head can do this' });
};

module.exports = { fleetAuth, requireHead };