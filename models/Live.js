const mongoose = require('mongoose');

const liveSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    faculty: String,

    department: String,

    level: String,

    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    isActive: {
      type: Boolean,
      default: false,
    },

    scheduledAt: {
      type: Date,
    },

    endedAt: {
      type: Date,
    },

    status: {
      type: String,
      enum: ['scheduled', 'live', 'ended'],
      default: 'scheduled',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Live', liveSchema);