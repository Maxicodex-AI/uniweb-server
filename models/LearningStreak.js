const mongoose = require('mongoose');

const learningStreakSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    currentStreak: {
      type: Number,
      default: 0,
    },
    longestStreak: {
      type: Number,
      default: 0,
    },
    lastActivityDate: {
      type: Date,
      default: null,
    },
    // Days of week active (for weekly display)
    weeklyActivity: {
      type: [Boolean],
      default: [false, false, false, false, false, false, false],
    },
    totalStudyDays: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LearningStreak', learningStreakSchema);