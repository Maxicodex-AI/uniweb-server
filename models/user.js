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
      enum: ['student', 'lecturer', 'admin'],
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
    avatarColor: {
      type: String,
      default: '#16a34a',
    },
    firstLogin: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);
module.exports = User;
