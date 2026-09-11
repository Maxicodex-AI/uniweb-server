const Chat = require('../models/Chat');
const Room = require('../models/Room');

// ================= SEND MESSAGE =================

exports.sendMessage = async (req, res) => {
  try {

    const user = req.user;
    const io = req.app.get('io');
    const { message, roomId } = req.body;

    // Find the room
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

// ===== PERMISSION CHECK =====

    // Global room — super admin only
    if (room.type === 'global') {
      if (user.role !== 'admin') {
        return res.status(403).json({
          message: 'Only super admin can post in the global room',
        });
      }
    }

    // Faculty bulletin room — faculty admin of same faculty only
    if (room.type === 'bulletin') {
      if (user.role === 'admin') {
        // Super admin cannot post in faculty bulletin
        return res.status(403).json({
          message: 'Super admin cannot post in faculty bulletin rooms',
        });
      }
      if (user.role !== 'faculty_admin' || room.faculty !== user.faculty) {
        return res.status(403).json({
          message: 'Only the faculty admin of this faculty can post here',
        });
      }
    }

    // Lecturer rooms — lecturers and faculty_admin only
    if (room.type === 'lecturer') {
      if (user.role !== 'lecturer' && user.role !== 'faculty_admin' && user.role !== 'admin') {
        return res.status(403).json({
          message: 'Only lecturers can post in this room',
        });
      }

      // Faculty room — must be same faculty
      if (room.subType === 'faculty' && room.faculty !== user.faculty) {
        return res.status(403).json({
          message: 'You are not in this faculty',
        });
      }

      // Department room — must be same faculty + department
      if (room.subType === 'department' &&
        (room.faculty !== user.faculty || room.department !== user.department)) {
        return res.status(403).json({
          message: 'You are not in this department',
        });
      }
    }

    // Student general room — students only, no admins, no lecturers
    if (room.type === 'student' && room.subType === 'general') {
      if (user.role !== 'student') {
        return res.status(403).json({
          message: 'Only students can post in the general room',
        });
      }
    }

    // Resources room — lecturers + faculty_admin + student reps only
    if (room.type === 'student' && room.subType === 'resources') {
      const canPost =
        user.role === 'lecturer' ||
        user.role === 'faculty_admin' ||
        user.role === 'admin' ||
        (user.role === 'student' && user.canHostLive === true);

      if (!canPost) {
        return res.status(403).json({
          message: 'Only lecturers and class representatives can post here',
        });
      }
    }

    // Lecturer rooms — lecturers only (all subtypes)
    if (room.type === 'lecturer') {
      if (user.role !== 'lecturer' && user.role !== 'admin') {
        return res.status(403).json({
          message: 'Only lecturers can post in this room',
        });
      }

      // Faculty room — must be same faculty
      if (room.subType === 'faculty' && room.faculty !== user.faculty) {
        return res.status(403).json({
          message: 'You are not in this faculty',
        });
      }

      // Department room — must be same faculty + department
      if (room.subType === 'department' &&
        (room.faculty !== user.faculty || room.department !== user.department)) {
        return res.status(403).json({
          message: 'You are not in this department',
        });
      }
    }

    // Student general room — students only
    if (room.type === 'student' && room.subType === 'general') {
      if (user.role !== 'student') {
        return res.status(403).json({
          message: 'Only students can post in the general room',
        });
      }
    }

    // Resources room — lecturers + student reps only
    if (room.type === 'student' && room.subType === 'resources') {
      const canPost =
        user.role === 'lecturer' ||
        user.role === 'admin' ||
        (user.role === 'student' && user.canHostLive === true);

      if (!canPost) {
        return res.status(403).json({
          message: 'Only lecturers and class representatives can post here',
        });
      }
    }

// ===== CREATE MESSAGE =====
    const chat = await Chat.create({
      message,
      sender: user._id,
      roomId: room._id,
      faculty: user.faculty,
      department: user.department,
      level: user.level,
      role: user.role,
      chatType: room.type === 'bulletin' ? 'admin' :
        room.subType === 'resources' ? 'resources' :
        user.role === 'lecturer' ? 'lecturer' :
        user.role === 'faculty_admin' ? 'lecturer' :
        user.role === 'admin' ? 'admin' : 'student',
    });

    const populated = await chat.populate('sender', 'name role avatarColor');

    // Emit to the specific room
    io.to(room.name).emit('newMessage', populated);

    res.json(populated);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};


// ================= GET MESSAGES =================

exports.getMessages = async (req, res) => {
  try {

    const { roomId } = req.query;
    const user = req.user;

    if (!roomId) {
      return res.status(400).json({ message: 'roomId is required' });
    }

    // Find the room and verify user has access
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Verify access
    if (room.type === 'lecturer' && user.role === 'student') {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (room.type === 'student') {
      if (
        user.role !== 'admin' &&
        (room.faculty !== user.faculty ||
          room.department !== user.department ||
          room.level !== user.level)
      ) {
        // Lecturers can access resources rooms in their faculty
        if (user.role === 'lecturer' && room.subType === 'resources' && room.faculty === user.faculty) {
          // allowed
        } else {
          return res.status(403).json({ message: 'Access denied' });
        }
      }
    }

    const messages = await Chat.find({ roomId })
      .populate('sender', 'name role avatarColor')
      .sort({ createdAt: 1 });

    res.json(messages);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};


// ================= ADD REACTION =================

exports.addReaction = async (req, res) => {
  try {

    const { id } = req.params;
    const { emoji } = req.body;
    const user = req.user;
    const io = req.app.get('io');

    const chat = await Chat.findById(id);
    if (!chat) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Only allow reactions in resources rooms
    const room = await Room.findById(chat.roomId);
    if (!room || room.subType !== 'resources') {
      return res.status(400).json({
        message: 'Reactions are only available in resources rooms',
      });
    }

    // Check if user already reacted with this emoji — toggle it off
    const existingIndex = chat.reactions.findIndex(
      r => r.userId.toString() === user._id.toString() && r.emoji === emoji
    );

    if (existingIndex > -1) {
      // Remove reaction (toggle off)
      chat.reactions.splice(existingIndex, 1);
    } else {
      // Remove any previous reaction from this user first (one reaction per user)
      const prevIndex = chat.reactions.findIndex(
        r => r.userId.toString() === user._id.toString()
      );
      if (prevIndex > -1) chat.reactions.splice(prevIndex, 1);

      // Add new reaction
      chat.reactions.push({ userId: user._id, emoji });
    }

    await chat.save();

    const populated = await chat.populate('sender', 'name role avatarColor');

    // Emit reaction update to room
    io.to(room.name).emit('reactionUpdate', populated);

    res.json(populated);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
// ================= EDIT MESSAGE =================

exports.editMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const user = req.user;
    const io = req.app.get('io');

    const chat = await Chat.findById(id);

    if (!chat) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Only the sender can edit their own message
    if (chat.sender.toString() !== user._id.toString()) {
      return res.status(403).json({ message: 'You can only edit your own messages' });
    }

    // Save original message before editing
    if (!chat.originalMessage) {
      chat.originalMessage = chat.message;
    }

    chat.message = message;
    chat.edited = true;
    chat.editedAt = new Date();

    await chat.save();

    const populated = await chat.populate('sender', 'name role avatarColor');

    // Get room to emit to
    const Room = require('../models/Room');
    const room = await Room.findById(chat.roomId);
    if (room) {
      io.to(room.name).emit('messageEdited', populated);
    }

    res.json(populated);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};


// ================= DELETE MESSAGE FOR ALL =================

exports.deleteMessageForAll = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const io = req.app.get('io');

    const chat = await Chat.findById(id);

    if (!chat) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Allow message sender OR any admin role to delete for everyone
    const isOwner = chat.sender.toString() === user._id.toString();
    const isAdmin = ['admin', 'faculty_admin', 'department_admin'].includes(user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'You can only delete your own messages for everyone' });
    }

    // Mark as deleted for all
    chat.deletedForAll = true;
    chat.deletedAt = new Date();
    chat.message = 'This message was deleted';
    await chat.save();

    const populated = await chat.populate('sender', 'name role avatarColor');

    // Get room to emit to
    const Room = require('../models/Room');
    const room = await Room.findById(chat.roomId);
    if (room) {
      io.to(room.name).emit('messageDeleted', { messageId: id, deletedForAll: true });
    }

    res.json({ message: 'Message deleted', messageId: id });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};