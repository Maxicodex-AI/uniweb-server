// routes/healthRoutes.js  (mounted at /api/health)
//
//   Students (any signed-in UniWeb user): read the school's health details
//   Super Admin: appoint / remove the Health Head
//   Health Head (or Super Admin): edit the settings, read the activity log
//
// Provider registration and approval are added to this file in the next stage.

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const healthAuth = require('../middleware/healthAuth');
const User = require('../models/user');
const HealthSettings = require('../models/HealthSettings');
const HealthAudit = require('../models/HealthAudit');
const Provider = require('../models/Provider');
const { publicProvider } = require('../utils/openStatus');
const { validateHours, cleanServices } = require('../utils/healthValidate');

const isId = v => mongoose.isValidObjectId(v);
const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const actorRef = req => ({ kind: req.healthActor.kind, id: req.healthActor.id, name: req.healthActor.name });

async function logAudit({ action, actor, target = null, details = null }) {
  try {
    await HealthAudit.create({ action, actor, target, details });
  } catch (err) {
    console.error('Health audit error:', err.message);
  }
}

// Phone numbers: digits, spaces, + - ( ), up to 20 characters. Empty means "not set".
const PHONE_RE = /^[0-9+\-()\s]{3,20}$/;
function cleanPhone(v) {
  const s = clean(v, 20);
  if (s === '') return { value: '' };
  return PHONE_RE.test(s) ? { value: s } : { error: true };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Returns { value } or { error: 'message' }
function validateSettings(body) {
  const out = {};

  out.centerName = clean(body.centerName, 80) || 'School Medical Centre';
  out.location = clean(body.location, 160);
  out.open24h = !!body.open24h;

  for (const field of ['centerPhone', 'emergencyPhone', 'securityPhone', 'counsellingPhone', 'nationalEmergency']) {
    const r = cleanPhone(body[field]);
    if (r.error) return { error: `Check the phone number in "${field}". Use digits only, for example 08012345678.` };
    out[field] = r.value;
  }
  if (!out.nationalEmergency) out.nationalEmergency = '112';

  const hours = Array.isArray(body.hours) ? body.hours : [];
  if (hours.length > 10) return { error: 'Too many opening-hour rows (10 at most).' };
  out.hours = [];
  for (const h of hours) {
    const days = Array.isArray(h.days) ? [...new Set(h.days.map(Number))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [];
    if (days.length === 0) return { error: 'Each opening-hours row needs at least one day.' };
    if (!TIME_RE.test(h.open) || !TIME_RE.test(h.close)) return { error: 'Opening and closing times must look like 08:00.' };
    if (h.open >= h.close) return { error: 'Closing time must be later than opening time.' };
    out.hours.push({ label: clean(h.label, 40), days: days.sort(), open: h.open, close: h.close });
  }

  const services = Array.isArray(body.services) ? body.services : [];
  if (services.length > 20) return { error: 'Too many services (20 at most).' };
  out.services = services.map(s => clean(s, 40)).filter(Boolean);

  return { value: out };
}

const DEFAULTS = {
  centerName: 'School Medical Centre', centerPhone: '', emergencyPhone: '', securityPhone: '',
  counsellingPhone: '', nationalEmergency: '112', location: '', open24h: false, hours: [], services: [],
};

// ===== STUDENTS: the details the Health page shows =====
router.get('/info', auth, async (req, res) => {
  try {
    const s = await HealthSettings.findOne({ key: 'main' }).lean();
    const info = s
      ? {
          centerName: s.centerName, centerPhone: s.centerPhone, emergencyPhone: s.emergencyPhone,
          securityPhone: s.securityPhone, counsellingPhone: s.counsellingPhone,
          nationalEmergency: s.nationalEmergency || '112', location: s.location,
          open24h: !!s.open24h, hours: s.hours || [], services: s.services || [],
        }
      : DEFAULTS;
    // The server's clock decides "open now", so a wrong phone clock cannot mislead a student
    res.json({ ...info, serverNow: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== SUPER ADMIN: appoint / remove the Health Head =====
const saRef = req => ({ kind: 'superadmin', id: req.user._id, name: req.user.name });

router.get('/head', auth, authorizeRole('admin'), async (req, res) => {
  try {
    const head = await User.findOne({ isHealthHead: true }).select('name email faculty department avatarColor');
    res.json(head || null);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Replaces the current head. Staff (lecturers and admins) only, never students.
router.put('/head/:userId', auth, authorizeRole('admin'), async (req, res) => {
  try {
    if (!isId(req.params.userId)) return res.status(400).json({ message: 'Invalid user id' });
    const user = await User.findById(req.params.userId).select('name role isHealthHead');
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!['lecturer', 'department_admin', 'faculty_admin'].includes(user.role)) {
      return res.status(400).json({ message: 'Only a lecturer or staff member can be appointed Health Head' });
    }
    if (user.isHealthHead) return res.json({ message: `${user.name} is already the Health Head` });

    const previous = await User.findOne({ isHealthHead: true }).select('name');
    await User.updateMany({ isHealthHead: true }, { $set: { isHealthHead: false } });
    await User.updateOne({ _id: user._id }, { $set: { isHealthHead: true } });

    await logAudit({
      action: 'head.appoint',
      actor: saRef(req),
      target: { kind: 'user', id: user._id, label: user.name },
      details: previous ? { replaced: previous.name } : null,
    });
    res.json({ message: `${user.name} is now the Health Head` });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'Another Health Head was just appointed. Refresh and try again.' });
    }
    console.error('Appoint health head error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/head', auth, authorizeRole('admin'), async (req, res) => {
  try {
    const previous = await User.findOne({ isHealthHead: true }).select('name');
    await User.updateMany({ isHealthHead: true }, { $set: { isHealthHead: false } });
    if (previous) {
      await logAudit({ action: 'head.remove', actor: saRef(req), target: { kind: 'user', id: previous._id, label: previous.name } });
    }
    res.json({ message: 'Health Head removed' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== HEALTH ADMIN PORTAL =====
router.get('/me', healthAuth, async (req, res) => {
  const pendingProviders = await Provider.countDocuments({ accountStatus: 'pending' });
  res.json({
    actor: { id: String(req.healthActor.id), kind: req.healthActor.kind, name: req.healthActor.name },
    counts: { pendingProviders },
  });
});

router.get('/settings', healthAuth, async (req, res) => {
  try {
    const s = await HealthSettings.findOne({ key: 'main' }).lean();
    res.json(s ? { ...DEFAULTS, ...s } : { ...DEFAULTS, updatedAt: null, updatedBy: null });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/settings', healthAuth, async (req, res) => {
  try {
    const checked = validateSettings(req.body || {});
    if (checked.error) return res.status(400).json({ message: checked.error });

    const before = (await HealthSettings.findOne({ key: 'main' }).lean()) || DEFAULTS;
    const changed = Object.keys(checked.value).filter(k => JSON.stringify(checked.value[k]) !== JSON.stringify(before[k]));

    const saved = await HealthSettings.findOneAndUpdate(
      { key: 'main' },
      { $set: { ...checked.value, updatedBy: actorRef(req) } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    if (changed.length) {
      await logAudit({ action: 'settings.update', actor: actorRef(req), details: { changed } });
    }
    res.json({ settings: saved, message: changed.length ? 'Saved' : 'Nothing changed' });
  } catch (err) {
    console.error('Health settings error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ----- Providers: approvals (Health Head or Super Admin) -----
const PROVIDER_STATUSES = ['pending', 'approved', 'rejected', 'suspended'];
const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const providerLabel = p => ({ kind: 'provider', id: p._id, label: `${p.businessName} (${p.type})` });

router.get('/providers', healthAuth, async (req, res) => {
  try {
    const filter = {};
    if (PROVIDER_STATUSES.includes(req.query.status)) filter.accountStatus = req.query.status;
    if (['pharmacy', 'clinic', 'shop'].includes(req.query.type)) filter.type = req.query.type;
    if (req.query.q) {
      const rx = new RegExp(escapeRegex(clean(req.query.q, 60)), 'i');
      filter.$or = [{ businessName: rx }, { ownerName: rx }, { phone: rx }, { address: rx }];
    }
    res.json(await Provider.find(filter).select('-password').sort({ createdAt: -1 }).limit(300).lean());
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

async function loadProvider(req, res) {
  if (!isId(req.params.id)) { res.status(400).json({ message: 'Invalid id' }); return null; }
  const p = await Provider.findById(req.params.id).select('-password');
  if (!p) { res.status(404).json({ message: 'Provider not found' }); return null; }
  return p;
}

router.get('/providers/:id', healthAuth, async (req, res) => {
  try {
    const p = await loadProvider(req, res);
    if (!p) return;
    const history = await HealthAudit.find({ 'target.id': p._id }).sort({ createdAt: -1 }).limit(30).lean();
    res.json({ provider: p, history });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Approve: the Health Head confirms they checked the business in person
router.put('/providers/:id/approve', healthAuth, async (req, res) => {
  try {
    const p = await loadProvider(req, res);
    if (!p) return;
    if (!['pending', 'rejected'].includes(p.accountStatus)) {
      return res.status(400).json({ message: 'Only pending or rejected applications can be approved' });
    }
    if ((req.body || {}).verifiedInPerson !== true) {
      return res.status(400).json({ message: 'Please confirm you checked this business in person' });
    }
    await Provider.updateOne({ _id: p._id }, { $set: {
      accountStatus: 'approved', statusReason: null, verifiedInPerson: true,
      reviewedBy: actorRef(req), reviewedAt: new Date(),
    } });
    await logAudit({ action: 'provider.approve', actor: actorRef(req), target: providerLabel(p) });
    res.json({ message: `${p.businessName} approved. Students can now see it.` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

async function closeProvider(req, res, { from, to, action }) {
  try {
    const p = await loadProvider(req, res);
    if (!p) return;
    if (!from.includes(p.accountStatus)) return res.status(400).json({ message: `Only ${from.join(' or ')} providers can be ${to}` });
    const reason = clean((req.body || {}).reason, 300);
    if (reason.length < 3) return res.status(400).json({ message: 'A reason is required' });
    await Provider.updateOne({ _id: p._id }, { $set: {
      accountStatus: to, statusReason: reason, reviewedBy: actorRef(req), reviewedAt: new Date(),
    } });
    await logAudit({ action, actor: actorRef(req), target: providerLabel(p), details: { reason } });
    res.json({ message: `${p.businessName} ${to}` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}
router.put('/providers/:id/reject', healthAuth, (req, res) => closeProvider(req, res, { from: ['pending'], to: 'rejected', action: 'provider.reject' }));
// Suspending hides the listing from students at once
router.put('/providers/:id/suspend', healthAuth, (req, res) => closeProvider(req, res, { from: ['approved'], to: 'suspended', action: 'provider.suspend' }));

router.put('/providers/:id/reinstate', healthAuth, async (req, res) => {
  try {
    const p = await loadProvider(req, res);
    if (!p) return;
    if (p.accountStatus !== 'suspended') return res.status(400).json({ message: 'Only suspended providers can be reinstated' });
    await Provider.updateOne({ _id: p._id }, { $set: { accountStatus: 'approved', statusReason: null, reviewedBy: actorRef(req), reviewedAt: new Date() } });
    await logAudit({ action: 'provider.reinstate', actor: actorRef(req), target: providerLabel(p) });
    res.json({ message: `${p.businessName} reinstated` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----- Students: the directory of approved places -----
router.get('/directory', auth, async (req, res) => {
  try {
    const filter = { accountStatus: 'approved' };
    if (['pharmacy', 'clinic', 'shop'].includes(req.query.type)) filter.type = req.query.type;
    const list = await Provider.find(filter).select('-password -reviewedBy -email -ownerName').lean();
    const now = new Date();
    res.json({ places: list.map(p => publicProvider(p, now)), serverNow: now.toISOString() });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/audit', healthAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const filter = {};
    if (req.query.before && !Number.isNaN(Date.parse(req.query.before))) {
      filter.createdAt = { $lt: new Date(req.query.before) };
    }
    res.json(await HealthAudit.find(filter).sort({ createdAt: -1 }).limit(limit).lean());
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;