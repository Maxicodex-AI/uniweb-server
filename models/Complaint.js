// models/Complaint.js
// A report from a student (or any signed-in UniWeb user) about a tricycle or
// its driver. The reporter's identity is visible to the Fleet Head only.
const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    by: { type: mongoose.Schema.Types.Mixed, default: null }, // { kind, id, name }
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const complaintSchema = new mongoose.Schema(
  {
    // ----- Who reported (hidden from fleet admins, who are drivers themselves) -----
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reporterName: { type: String, default: '' },
    reporterEmail: { type: String, default: '' },
    reporterPhone: { type: String, default: '' },

    // ----- What it is about -----
    vehicleNumber: { type: String, default: '' },
    // Which day the ride was. "earlier" = more than a day ago, so no driver is linked.
    when: { type: String, enum: ['today', 'yesterday', 'earlier'], default: 'today' },
    // Worked out from the daily check-in records, when the day and tricycle are known
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null },
    driverName: { type: String, default: '' },

    category: { type: String, required: true },
    priority: { type: String, enum: ['normal', 'high'], default: 'normal' },
    message: { type: String, required: true, maxlength: 1000 },

    // ----- Handling -----
    status: { type: String, enum: ['new', 'in_review', 'resolved', 'dismissed'], default: 'new' },
    // Shown to the reporter when the report is resolved or dismissed
    resolution: { type: String, default: '' },
    handledBy: { type: mongoose.Schema.Types.Mixed, default: null },
    statusChangedAt: { type: Date, default: null },
    notes: [noteSchema], // internal, never shown to the reporter
  },
  { timestamps: true }
);

complaintSchema.index({ status: 1, createdAt: -1 });
complaintSchema.index({ reporter: 1, createdAt: -1 });
complaintSchema.index({ driver: 1, createdAt: -1 });

module.exports = mongoose.model('Complaint', complaintSchema);