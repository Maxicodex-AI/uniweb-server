// models/Vehicle.js
// The TETFund tricycle roster. Drivers do not own a tricycle; they pick one
// from this list at their daily check-in.
const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true, uppercase: true, trim: true },
    plate: { type: String, default: '', uppercase: true, trim: true },
    seats: { type: Number, default: 3, min: 1, max: 8 },
    status: {
      type: String,
      enum: ['available', 'maintenance', 'retired'],
      default: 'available',
    },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Vehicle', vehicleSchema);