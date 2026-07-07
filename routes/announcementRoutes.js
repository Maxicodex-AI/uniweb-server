const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const {
  createAnnouncement,
  getAnnouncements,
} = require('../controllers/announcementController');

// Create announcement (lecturer/admin only)
router.post(
  '/',
  auth,
  authorizeRole('lecturer', 'admin'),
  createAnnouncement
);

// Get announcements (any logged-in user)
router.get('/', auth, getAnnouncements);

module.exports = router;
