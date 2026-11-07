// models/FleetAnnouncement.js
// Messages from fleet admins to drivers.
const mongoose = require('mongoose');

const fleetAnnouncementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    urgent: { type: Boolean, default: false },
    audience: { type: String, enum: ['all', 'onShift', 'driver'], default: 'all' },
    targetDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null },
    createdBy: { type: mongoose.Schema.Types.Mixed, default: null }, // { kind, id, name }
    recipientCount: { type: Number, default: 0 },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Driver' }],
  },
  { timestamps: true }
);

fleetAnnouncementSchema.index({ createdAt: -1 });

module.exports = mongoose.model('FleetAnnouncement', fleetAnnouncementSchema);