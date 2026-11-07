// models/FleetAudit.js
// Append-only record of every fleet action: who did what to whom, and when.
const mongoose = require('mongoose');

const fleetAuditSchema = new mongoose.Schema(
  {
    action: { type: String, required: true }, // e.g. 'driver.approve'
    actor: { type: mongoose.Schema.Types.Mixed, default: null }, // { kind, id, name }
    target: { type: mongoose.Schema.Types.Mixed, default: null }, // { kind, id, label }
    details: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

fleetAuditSchema.index({ createdAt: -1 });
fleetAuditSchema.index({ 'target.id': 1, createdAt: -1 });

module.exports = mongoose.model('FleetAudit', fleetAuditSchema);