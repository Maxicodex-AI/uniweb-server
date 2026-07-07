const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');

// Only authenticated students can access this
router.get('/student', auth, authorizeRole('student'), (req, res) => {
  res.json({ message: `Welcome student ${req.user.name}` });
});

// Only lecturers or admins can access this
router.get('/lecturer', auth, authorizeRole('lecturer', 'admin'), (req, res) => {
  res.json({ message: `Welcome lecturer/admin ${req.user.name}` });
});

// Anyone authenticated can view this
router.get('/any', auth, (req, res) => {
  res.json({ message: `Hello ${req.user.name}, your role is ${req.user.role}` });
});

module.exports = router;
