// models/HealthAudit.js
// Append-only record of every action in the health admin portal.
const mongoose = require('mongoose');

const healthAuditSchema = new mongoose.Schema(
  {
    action: { type: String, required: true }, // e.g. 'settings.update'
    actor: { type: mongoose.Schema.Types.Mixed, default: null }, // { kind, id, name }
    target: { type: mongoose.Schema.Types.Mixed, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

healthAuditSchema.index({ createdAt: -1 });

module.exports = mongoose.model('HealthAudit', healthAuditSchema);