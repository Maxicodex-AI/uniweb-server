// models/CheckIn.js
// One record per driver per day: which tricycle they picked. The two unique
// indexes enforce the daily rule at database level:
//   - a driver has at most one tricycle per day
//   - a tricycle belongs to at most one driver per day
const mongoose = require('mongoose');

const checkInSchema = new mongoose.Schema(
  {
    day: { type: String, required: true }, // 'YYYY-MM-DD' in Africa/Lagos
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    // Snapshots, so history still reads correctly if a name or number changes
    driverName: { type: String, default: '' },
    vehicleNumber: { type: String, default: '' },
    checkedInAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

checkInSchema.index({ day: 1, driver: 1 }, { unique: true });
checkInSchema.index({ day: 1, vehicle: 1 }, { unique: true });

module.exports = mongoose.model('CheckIn', checkInSchema);