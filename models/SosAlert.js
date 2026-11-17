// models/SosAlert.js
// An emergency alert raised by a driver. It stays "active" until an admin
// resolves it or the driver cancels it as a false alarm.
const mongoose = require('mongoose');

const sosAlertSchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
    // Snapshots, so the alert still reads correctly if a name or number changes
    driverName: { type: String, default: '' },
    driverPhone: { type: String, default: '' },
    vehicleNumber: { type: String, default: '' },

    // Latest known position. Updated live while the alert is active.
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      updatedAt: { type: Date, default: null },
    },

    // open         : raised, nobody has responded yet (the alarm rings)
    // acknowledged : an admin has seen it and is responding
    // resolved     : an admin closed it
    // cancelled    : the driver said they are safe
    status: {
      type: String,
      enum: ['open', 'acknowledged', 'resolved', 'cancelled'],
      default: 'open',
    },
    // true while open or acknowledged. A boolean, so the database can enforce
    // "at most one active alert per driver" with a partial unique index.
    active: { type: Boolean, default: true },

    acknowledgedBy: { type: mongoose.Schema.Types.Mixed, default: null }, // { kind, id, name }
    acknowledgedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.Mixed, default: null },
    resolvedAt: { type: Date, default: null },
    note: { type: String, default: '' }, // what happened, written by the admin who resolved it
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

sosAlertSchema.index({ driver: 1 }, { unique: true, partialFilterExpression: { active: true } });
sosAlertSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SosAlert', sosAlertSchema);