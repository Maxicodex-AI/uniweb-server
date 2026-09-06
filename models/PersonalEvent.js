const mongoose = require('mongoose');

const personalEventSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String },
    type: {
      type: String,
      enum: ['study', 'meeting', 'deadline', 'reminder', 'class', 'other'],
      default: 'reminder',
    },
    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String },
    isRecurring: { type: Boolean, default: false },
    recurringDays: [{ type: String }],
    reminderMinutes: { type: Number, default: 15 },
    color: { type: String, default: '#16a34a' },
    isCompleted: { type: Boolean, default: false },
    courseCode: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PersonalEvent', personalEventSchema);