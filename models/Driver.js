const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    tricycleNumber: { type: String, required: true, unique: true },
    totalSeats: { type: Number, default: 3 },
    photo: { type: String, default: null },

    // Live status
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

module.exports = mongoose.model('Driver', driverSchema);