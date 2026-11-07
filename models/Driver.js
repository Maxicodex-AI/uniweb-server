// models/Driver.js
const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    photo: { type: String, default: null },

    // Driving licence number. Required at registration (checked in the route,
    // not here, so drivers who registered before this field existed can still
    // be saved). Unique when present.
    licenseNumber: { type: String, default: null },

    // ===== Account status (decided by the fleet admins) =====
    // pending   : registered, waiting for approval. Cannot work.
    // approved  : can check in, start shifts and appear on maps.
    // rejected  : application refused (reason in statusReason).
    // suspended : was approved, now blocked (reason in statusReason).
    accountStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'suspended'],
      default: 'pending',
    },
    statusReason: { type: String, default: null },
    reviewedBy: { type: mongoose.Schema.Types.Mixed, default: null }, // { kind, id, name }
    reviewedAt: { type: Date, default: null },

    // Fleet admins are drivers who may use the fleet portal. They have no
    // UniWeb account; the Fleet Head appoints and removes them.
    isFleetAdmin: { type: Boolean, default: false },

    // The driver agreed that their live location is visible during a shift
    locationConsent: { type: Boolean, default: false },
    consentAt: { type: Date, default: null },

    // ===== Today's tricycle (set at the daily check-in) =====
    currentVehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    checkedInDay: { type: String, default: null }, // 'YYYY-MM-DD' in Africa/Lagos
    tricycleNumber: { type: String, default: null },
    totalSeats: { type: Number, default: 3 },

    // ===== Live status =====
    isOnShift: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    currentLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      updatedAt: { type: Date, default: null },
    },
    availableSeats: { type: Number, default: 3 },
    status: {
      type: String,
      enum: ['offline', 'active', 'full'],
      default: 'offline',
    },
  },
  { timestamps: true }
);

// Two drivers can never share a licence number (ignored while it is empty)
driverSchema.index(
  { licenseNumber: 1 },
  { unique: true, partialFilterExpression: { licenseNumber: { $type: 'string' } } }
);
driverSchema.index({ accountStatus: 1 });

module.exports = mongoose.model('Driver', driverSchema);