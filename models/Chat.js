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

    // Link message to a specific room
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },

    // Keep these for quick filtering without joining
    faculty: String,
    department: String,
    level: String,
    role: String,

    chatType: {
      type: String,
      enum: ['student', 'lecturer', 'admin', 'resources'],
      default: 'student',
    },

    // Reactions — array of { userId, emoji }
    reactions: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        emoji: {
          type: String,
          enum: ['👍', '❤️', '😂', '😮', '🙏'],
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Chat', chatSchema);