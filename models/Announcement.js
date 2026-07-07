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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Announcement', announcementSchema);
