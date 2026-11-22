// middleware/healthAuth.js
// Authentication for the health admin portal. Two kinds of people may use it:
//   head        a UniWeb user flagged isHealthHead
//   superadmin  the Super Admin, as a backup
// On success req.healthActor = { kind, id, name }.
const jwt = require('jsonwebtoken');
const User = require('../models/user');

const healthAuth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);

    // Driver (and later provider) tokens never belong in UniWeb's health admin
    if (decoded.role === 'driver' || decoded.role === 'provider') {
      return res.status(401).json({ message: 'Not authorized for this portal' });
    }

    const user = await User.findById(decoded.id).select('name role isHealthHead');
    if (!user) return res.status(401).json({ message: 'Not authorized' });

    if (user.isHealthHead) {
      req.healthActor = { kind: 'head', id: user._id, name: user.name };
      return next();
    }
    if (user.role === 'admin') {
      req.healthActor = { kind: 'superadmin', id: user._id, name: user.name };
      return next();
    }
    return res.status(403).json({ message: 'Health admin access required' });
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

module.exports = healthAuth;