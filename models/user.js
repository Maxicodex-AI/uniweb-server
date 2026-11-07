// models/user.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    role: {
      type: String,
      enum: ['student', 'lecturer', 'department_admin', 'faculty_admin', 'admin'],
      default: 'student',
    },
    faculty: {
      type: String,
      required: function () {
        return this.role !== 'admin';
      },
    },
    department: {
      type: String,
      required: function () {
        return this.role !== 'admin';
      },
    },
    level: {
      type: String,
      required: function () {
        return this.role === 'student';
      },
    },
    verified: {
      type: Boolean,
      default: false,
    },
    graduated: {
      type: Boolean,
      default: false,
    },
    canHostLive: {
      type: Boolean,
      default: false,
    },

    // Fleet Head: the one lecturer the Super Admin appoints to run the TETFund
    // tricycle fleet portal. The person keeps their lecturer role and normal
    // UniWeb login; this flag only unlocks the fleet portal. Set and cleared
    // by the Super Admin only. At most one user can hold it (see index below).
    isFleetHead: {
      type: Boolean,
      default: false,
    },

    avatarColor: {
      type: String,
      default: '#16a34a',
    },
    // Student registration number
    regNumber: {
      type: String,
      default: null,
    },

    // Lecturer staff ID
    staffId: {
      type: String,
      default: null,
    },

    // Date of birth
    dateOfBirth: {
      type: Date,
      default: null,
    },

    // Phone number
    phone: {
      type: String,
      default: null,
    },
    firstLogin: {
      type: Boolean,
      default: true,
    },
    notifLive: {
      type: Boolean,
      default: true,
    },
    notifAnnouncement: {
      type: Boolean,
      default: true,
    },
    notifLesson: {
      type: Boolean,
      default: true,
    },
    notifQuiz: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Only one Fleet Head at a time: the database itself refuses a second one.
userSchema.index(
  { isFleetHead: 1 },
  { unique: true, partialFilterExpression: { isFleetHead: true } }
);

const User = mongoose.model('User', userSchema);
module.exports = User;