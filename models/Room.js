const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({

  name: {
    type: String,
    required: true,
    unique: true,
  },

 type: {
    type: String,
    enum: ['global', 'lecturer', 'student', 'bulletin'],
    required: true,
  },

  // Sub-type for student rooms
  // general = students only chat freely
  // resources = lecturers + reps post, students read
  subType: {
    type: String,
    enum: ['general', 'resources', 'faculty', 'department', 'all', null],
    default: null,
  },

  faculty: {
    type: String,
    default: null,
  },

  department: {
    type: String,
    default: null,
  },

  level: {
    type: String,
    default: null,
  },

}, { timestamps: true });

module.exports = mongoose.model('Room', roomSchema);