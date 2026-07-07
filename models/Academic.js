const mongoose = require('mongoose');

const academicSchema = new mongoose.Schema(
  {
    session: {
      type: String,
      required: true, // 2025/2026
    },

    semester: {
      type: Number,
      enum: [1, 2],
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    promotionDone: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Academic', academicSchema);