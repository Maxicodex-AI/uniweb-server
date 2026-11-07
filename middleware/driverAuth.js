// middleware/driverAuth.js
// Authentication for the driver portal. Driver tokens are signed with the same
// secret as UniWeb tokens, so the role is checked explicitly here (and
// middleware/auth.js refuses driver tokens on the UniWeb side).
const jwt = require('jsonwebtoken');
const Driver = require('../models/Driver');

const driverAuth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'driver') {
      return res.status(401).json({ message: 'Not a driver token' });
    }

    const driver = await Driver.findById(decoded.id).select('-password');
    if (!driver) {
      return res.status(401).json({ message: 'Not authorized, driver not found' });
    }

    req.driver = driver;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

// Only approved drivers may work. Pending, rejected and suspended drivers can
// still sign in (to see their status) but nothing else.
const requireApproved = (req, res, next) => {
  const status = req.driver.accountStatus;
  if (status === 'approved') return next();

  const messages = {
    pending: 'Your account is waiting for approval.',
    rejected: 'Your application was not approved.',
    suspended: 'Your account has been suspended.',
  };
  return res.status(403).json({
    message: messages[status] || 'Your account is not active.',
    accountStatus: status,
    reason: req.driver.statusReason || null,
  });
};

module.exports = { driverAuth, requireApproved };