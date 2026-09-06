const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      required: true,
    },
    // Steps completed in this lesson
    stepsCompleted: {
      readNotes: { type: Boolean, default: false },
      watchedVideo: { type: Boolean, default: false },
      readAiExplanation: { type: Boolean, default: false },
      ranCode: { type: Boolean, default: false },
      completedSandbox: { type: Boolean, default: false },
      completedQuiz: { type: Boolean, default: false },
      submittedAssignment: { type: Boolean, default: false },
      joinedDiscussion: { type: Boolean, default: false },
    },
    // Overall completion percentage for this lesson
    completionPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    lastAccessedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// One progress record per student per lesson
progressSchema.index({ student: 1, lesson: 1 }, { unique: true });

module.exports = mongoose.model('Progress', progressSchema);