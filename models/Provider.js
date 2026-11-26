// models/Provider.js
// A pharmacy, clinic or shop owner. Providers have their own sign-in (separate
// from UniWeb) and appear to students only after the Health Head approves them.
const mongoose = require('mongoose');

const hoursSchema = new mongoose.Schema(
  {
    label: { type: String, default: '' },
    days: [{ type: Number, min: 0, max: 6 }],
    open: { type: String, default: '08:00' },
    close: { type: String, default: '18:00' },
  },
  { _id: false }
);

const providerSchema = new mongoose.Schema(
  {
    // ----- Identity (fixed once approved; only the Health Head can change these) -----
    ownerName: { type: String, required: true, trim: true },
    businessName: { type: String, required: true, trim: true },
    type: { type: String, enum: ['pharmacy', 'clinic', 'shop'], required: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String, default: '', lowercase: true, trim: true },

    // ----- The listing (the owner edits these) -----
    address: { type: String, default: '' },
    description: { type: String, default: '' },
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    services: [{ type: String }],
    hours: [hoursSchema],
    open24h: { type: Boolean, default: false },
    showPhone: { type: Boolean, default: true }, // show the number to students

    // One-tap status. Trusted for 12 hours, then the schedule takes over.
    liveStatus: { type: String, enum: ['open', 'busy', 'closed'], default: 'open' },
    liveStatusUpdatedAt: { type: Date, default: null },

    // ----- Approval, decided by the Health Head -----
    accountStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'suspended'],
      default: 'pending',
    },
    statusReason: { type: String, default: null },
    verifiedInPerson: { type: Boolean, default: false }, // ticked at approval
    reviewedBy: { type: mongoose.Schema.Types.Mixed, default: null }, // { kind, id, name }
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

providerSchema.index({ accountStatus: 1, type: 1 });

module.exports = mongoose.model('Provider', providerSchema);