const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },

    faculty: String,
    department: String,
    level: String,
    role: String,

    chatType: {
      type: String,
      enum: ['student', 'lecturer', 'admin', 'resources'],
      default: 'student',
    },

    // Edit tracking
    edited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    originalMessage: {
      type: String,
      default: null,
    },

        // Deleted for everyone (sender deletes)
    deletedForAll: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },

    // Reactions
    reactions: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        emoji: { type: String, enum: ['👍', '❤️', '😂', '😮', '🙏'] },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Chat', chatSchema);