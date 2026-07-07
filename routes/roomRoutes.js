const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getRooms } = require('../controllers/roomController');

// GET rooms for current user
router.get('/', auth, getRooms);

module.exports = router;