const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const {
  createAnnouncement,
  getAnnouncements,
  deleteAnnouncement,
} = require('../controllers/announcementController');

// Create announcement (lecturer, faculty_admin, admin only)
router.post(
  '/',
  auth,
  authorizeRole('lecturer', 'faculty_admin', 'admin'),
  createAnnouncement
);

// Get announcements (any logged-in user)
router.get('/', auth, getAnnouncements);

// Delete announcement (faculty_admin, admin only)
router.delete(
  '/:id',
  auth,
  authorizeRole('faculty_admin', 'admin'),
  deleteAnnouncement
);

module.exports = router;