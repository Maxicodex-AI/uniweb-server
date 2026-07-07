const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getMe,
  getAllUsers,
  toggleHostPermission,
  getLecturersByFaculty,
  updateProfile,
  markFirstLoginDone,
} = require('../controllers/userController');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');

// Register new user
router.post('/register', registerUser);

// Login user and return JWT
router.post('/login', loginUser);

// Get current logged-in user info
router.get('/me', auth, getMe);

// Update profile (any logged-in user)
router.put('/profile', auth, updateProfile);

// Mark first login as done
router.put('/first-login', auth, markFirstLoginDone);

// Get all users (admin only)
router.get('/all', auth, authorizeRole('admin'), getAllUsers);

// Toggle host permission for a student (admin only)
router.put('/:id/host-permission', auth, authorizeRole('admin'), toggleHostPermission);

// Get lecturers by faculty (any logged-in user)
router.get('/lecturers/:faculty', auth, getLecturersByFaculty);

module.exports = router;