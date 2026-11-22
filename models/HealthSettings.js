// models/HealthSettings.js
// The school's health details shown to students: emergency numbers, the medical
// centre's hours and services. One record only. Edited by the Health Head.
const mongoose = require('mongoose');

const hoursSchema = new mongoose.Schema(
  {
    label: { type: String, default: '' }, // e.g. "Mon - Fri"
    days: [{ type: Number, min: 0, max: 6 }], // 0 = Sunday ... 6 = Saturday
    open: { type: String, default: '08:00' }, // 'HH:MM', Nigerian time
    close: { type: String, default: '16:00' },
  },
  { _id: false }
);

const healthSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'main', unique: true },

    centerName: { type: String, default: 'School Medical Centre' },
    centerPhone: { type: String, default: '' },
    emergencyPhone: { type: String, default: '' }, // clinic emergency or ambulance line
    securityPhone: { type: String, default: '' }, // campus security
    counsellingPhone: { type: String, default: '' },
    nationalEmergency: { type: String, default: '112' },
    location: { type: String, default: '' }, // e.g. "Beside the Senate Building"
    open24h: { type: Boolean, default: false },
    hours: [hoursSchema],
    services: [{ type: String }],

    updatedBy: { type: mongoose.Schema.Types.Mixed, default: null }, // { kind, id, name }
  },
  { timestamps: true }
);

module.exports = mongoose.model('HealthSettings', healthSettingsSchema);