const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');

const {
  sendMessage,
  getMessages,
  addReaction,
} = require('../controllers/chatController');

// Send message (roomId required in body)
router.post('/', auth, sendMessage);

// Get messages for a specific room (roomId required as query param)
router.get('/', auth, getMessages);

// Add reaction to a message
router.put('/:id/reaction', auth, addReaction);

module.exports = router;