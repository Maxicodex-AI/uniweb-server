const mongoose = require('mongoose');

const timetableEntrySchema = new mongoose.Schema({
  courseCode: { type: String, required: true },
  courseTitle: { type: String, required: true },
  lecturer: { type: String, required: true },
  day: {
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    required: true,
  },
  startTime: { type: String, required: true }, // e.g. "08:00"
  endTime: { type: String, required: true },   // e.g. "10:00"
  venue: { type: String, required: true },
  type: {
    type: String,
    enum: ['Lecture', 'Lab', 'Tutorial', 'Live', 'Seminar'],
    default: 'Lecture',
  },
  color: { type: String, default: '#16a34a' },
});

const timetableSchema = new mongoose.Schema(
  {
    faculty: { type: String, required: true },
    department: { type: String, required: true },
    level: { type: String, required: true },
    semester: { type: String, required: true }, // e.g. "2025/2026 - Semester 1"
    entries: [timetableEntrySchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// One timetable per department/level/semester
timetableSchema.index({ faculty: 1, department: 1, level: 1, semester: 1 }, { unique: true });

module.exports = mongoose.model('Timetable', timetableSchema);