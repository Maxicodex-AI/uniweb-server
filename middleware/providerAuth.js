// middleware/providerAuth.js
// Authentication for the provider portal. Provider tokens are signed with the
// same secret as UniWeb tokens, so the role is checked explicitly here, and
// middleware/auth.js refuses provider tokens on the UniWeb side.
const jwt = require('jsonwebtoken');
const Provider = require('../models/Provider');

const providerAuth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'provider') return res.status(401).json({ message: 'Not a provider token' });

    const provider = await Provider.findById(decoded.id).select('-password');
    if (!provider) return res.status(401).json({ message: 'Not authorized, account not found' });

    req.provider = provider;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

// Only approved providers may change their listing
const requireApprovedProvider = (req, res, next) => {
  const status = req.provider.accountStatus;
  if (status === 'approved') return next();
  const messages = {
    pending: 'Your account is waiting for approval.',
    rejected: 'Your application was not approved.',
    suspended: 'Your account has been suspended.',
  };
  return res.status(403).json({ message: messages[status] || 'Your account is not active.', accountStatus: status, reason: req.provider.statusReason || null });
};

module.exports = { providerAuth, requireApprovedProvider };