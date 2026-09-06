const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');

const {
  sendMessage,
  getMessages,
  addReaction,
  editMessage,
  deleteMessageForAll,
} = require('../controllers/chatController');

// Send message
router.post('/', auth, sendMessage);

// Get messages for a specific room
router.get('/', auth, getMessages);

// Add reaction to a message
router.put('/:id/reaction', auth, addReaction);

// Edit a message (sender only)
router.put('/:id/edit', auth, editMessage);

// Delete message for everyone (sender only)
router.delete('/:id', auth, deleteMessageForAll);

module.exports = router;