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
  res.json({ actor: { id: String(req.healthActor.id), kind: req.healthActor.kind, name: req.healthActor.name } });
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