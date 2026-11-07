// utils/fleetAudit.js
const FleetAudit = require('../models/FleetAudit');

// Never throws: a failed log write must not break the action being logged.
async function logAudit({ action, actor, target = null, details = null }) {
  try {
    await FleetAudit.create({ action, actor, target, details });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

module.exports = { logAudit };