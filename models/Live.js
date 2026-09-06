const mongoose = require('mongoose');

const liveSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    // Single level — applies to all targets
    level: {
      type: String,
      required: true,
    },

    // Multiple faculty/department targets
    // e.g. [{ faculty: "Engineering", department: "Computer Science" }]
    targets: [
      {
        faculty: { type: String, required: true },
        department: { type: String, required: true },
      }
    ],

    // Keep single faculty/department for backward compatibility
    // and for lecturer-scoped filtering
    faculty: String,
    department: String,

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