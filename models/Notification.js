const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['live_started', 'announcement', 'lesson_approved', 'lesson_rejected', 'quiz_available', 'reminder', 'general'],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: { type: String }, // where to go when clicked
    isRead: { type: Boolean, default: false },
    data: { type: mongoose.Schema.Types.Mixed }, // extra data
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);