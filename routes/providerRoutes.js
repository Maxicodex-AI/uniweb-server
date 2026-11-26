// routes/providerRoutes.js  (mounted at /api/providers)
// The provider side: register, sign in, and manage the listing once approved.

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const Provider = require('../models/Provider');
const HealthAudit = require('../models/HealthAudit');
const { providerAuth, requireApprovedProvider } = require('../middleware/providerAuth');
const { normalizePhone, PHONE_RE } = require('../utils/phone');
const { validateHours, cleanServices, clean } = require('../utils/healthValidate');
const rateLimit = require('../utils/rateLimit');

const TYPES = ['pharmacy', 'clinic', 'shop'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const signToken = p => jwt.sign({ id: p._id, role: 'provider' }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Never send the password hash or the reviewer's identity back
function publicSelf(p) {
  const o = p.toObject ? p.toObject() : { ...p };
  delete o.password;
  delete o.reviewedBy;
  return o;
}

async function audit(action, actor, target, details) {
  try { await HealthAudit.create({ action, actor, target, details }); } catch (e) { console.error('Audit error:', e.message); }
}

const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 15, message: 'Too many sign-up attempts. Please try again later.' });

// ===== REGISTER =====
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const b = req.body || {};
    const ownerName = clean(b.ownerName, 80);
    const businessName = clean(b.businessName, 80);
    const type = b.type;
    const phone = normalizePhone(b.phone);
    const password = String(b.password || '');
    const address = clean(b.address, 160);
    const email = clean(b.email, 100).toLowerCase();

    if (ownerName.length < 2) return res.status(400).json({ message: 'Enter the owner’s full name' });
    if (businessName.length < 2) return res.status(400).json({ message: 'Enter the business name' });
    if (!TYPES.includes(type)) return res.status(400).json({ message: 'Choose pharmacy, clinic or shop' });
    if (!PHONE_RE.test(phone)) return res.status(400).json({ message: 'Enter a valid 11-digit phone number, e.g. 08012345678' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    if (address.length < 3) return res.status(400).json({ message: 'Enter the business address' });
    if (email && !EMAIL_RE.test(email)) return res.status(400).json({ message: 'That email address does not look right' });

    if (await Provider.findOne({ phone }).select('_id')) {
      return res.status(400).json({ message: 'This phone number is already registered' });
    }

    const hashed = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const provider = await Provider.create({
      ownerName, businessName, type, phone, email, address, password: hashed, accountStatus: 'pending',
    });

    await audit('provider.register', { kind: 'provider', id: provider._id, name: ownerName },
      { kind: 'provider', id: provider._id, label: `${businessName} (${type})` });

    res.status(201).json({ token: signToken(provider), provider: publicSelf(provider) });
  } catch (err) {
    if (err && err.code === 11000) return res.status(400).json({ message: 'This phone number is already registered' });
    console.error('Provider register error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== LOGIN =====
router.post('/login', async (req, res) => {
  try {
    const phone = normalizePhone((req.body || {}).phone);
    const password = String((req.body || {}).password || '');
    const provider = await Provider.findOne({ phone });
    if (!provider) return res.status(400).json({ message: 'Invalid phone or password' });
    if (!(await bcrypt.compare(password, provider.password))) return res.status(400).json({ message: 'Invalid phone or password' });
    res.json({ token: signToken(provider), provider: publicSelf(provider) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== MY ACCOUNT (any status, so pending / rejected / suspended owners can see why) =====
router.get('/me', providerAuth, async (req, res) => {
  res.json(publicSelf(req.provider));
});

// ===== EDIT MY LISTING (approved only) =====
router.put('/me', providerAuth, requireApprovedProvider, async (req, res) => {
  try {
    const b = req.body || {};
    const update = {};

    if (b.description !== undefined) update.description = clean(b.description, 500);
    if (b.address !== undefined) {
      const a = clean(b.address, 160);
      if (a.length < 3) return res.status(400).json({ message: 'Enter the business address' });
      update.address = a;
    }
    if (b.email !== undefined) {
      const e = clean(b.email, 100).toLowerCase();
      if (e && !EMAIL_RE.test(e)) return res.status(400).json({ message: 'That email address does not look right' });
      update.email = e;
    }
    if (b.showPhone !== undefined) update.showPhone = !!b.showPhone;
    if (b.open24h !== undefined) update.open24h = !!b.open24h;

    if (b.location !== undefined) {
      const l = b.location;
      if (l === null || (l && l.lat == null && l.lng == null)) {
        update.location = { lat: null, lng: null };
      } else if (l && typeof l.lat === 'number' && typeof l.lng === 'number' && Math.abs(l.lat) <= 90 && Math.abs(l.lng) <= 180) {
        update.location = { lat: l.lat, lng: l.lng };
      } else {
        return res.status(400).json({ message: 'That map location is not valid' });
      }
    }
    if (b.hours !== undefined) {
      const r = validateHours(b.hours);
      if (r.error) return res.status(400).json({ message: r.error });
      update.hours = r.value;
    }
    if (b.services !== undefined) {
      const r = cleanServices(b.services);
      if (r.error) return res.status(400).json({ message: r.error });
      update.services = r.value;
    }

    const saved = await Provider.findByIdAndUpdate(req.provider._id, { $set: update }, { new: true }).select('-password -reviewedBy');
    res.json({ provider: saved, message: 'Saved' });
  } catch (err) {
    console.error('Provider update error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== ONE-TAP STATUS =====
router.put('/status', providerAuth, requireApprovedProvider, async (req, res) => {
  const status = (req.body || {}).status;
  if (!['open', 'busy', 'closed'].includes(status)) return res.status(400).json({ message: 'Choose open, busy or closed' });
  const saved = await Provider.findByIdAndUpdate(
    req.provider._id,
    { $set: { liveStatus: status, liveStatusUpdatedAt: new Date() } },
    { new: true }
  ).select('-password -reviewedBy');
  res.json({ provider: saved });
});

module.exports = router;