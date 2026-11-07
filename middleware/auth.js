// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/user');

const auth = async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const token = header.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Driver tokens belong to the fleet portal only. They are never valid
    // for UniWeb routes, even though they are signed with the same secret.
    if (decoded.role === 'driver') {
      return res.status(401).json({ message: 'Not authorized for this portal' });
    }

    // Get user from token, exclude password
    const user = await User.findById(decoded.id).select('-password');

    // A valid token that matches no user (deleted account, or a token from
    // another collection) must be refused. Previously this fell through with
    // req.user = null and still called next().
    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

module.exports = auth;