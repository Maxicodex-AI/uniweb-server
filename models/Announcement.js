const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    content: {
      type: String,
    },
    link: {
      type: String,
    },
    videoUrl: {
      type: String,
    },
    faculty: {
      type: String,
      required: true,
    },
    department: {
      type: String,
    },
    level: {
      type: String,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Priority level
    priority: {
      type: String,
      enum: ['urgent', 'important', 'general'],
      default: 'general',
    },
    // Deletion audit trail
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedByName: {
      type: String,
      default: null,
    },
    deletedByRole: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Announcement', announcementSchema);