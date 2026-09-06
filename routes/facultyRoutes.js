const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const Faculty = require('../models/Faculty');
const User = require('../models/user');
const { notifyUser } = require('../utils/notificationHelper');

// ===== GET ALL FACULTIES (public) =====
router.get('/', async (req, res) => {
  try {
    const faculties = await Faculty.find({ isActive: true })
      .populate('facultyAdmin', 'name email avatarColor')
      .sort({ name: 1 });
    res.json(faculties);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== CREATE FACULTY =====
router.post('/', auth, authorizeRole('admin'), async (req, res) => {
  try {
    const { name, description, facultyAdminId } = req.body;

    // Check if faculty already exists
    const existing = await Faculty.findOne({ name });
    if (existing) {
      return res.status(400).json({ message: `Faculty "${name}" already exists` });
    }

    const faculty = await Faculty.create({
      name,
      description,
      createdBy: req.user._id,
    });

    // If facultyAdminId provided — assign faculty admin
    if (facultyAdminId) {
      const lecturer = await User.findById(facultyAdminId);
      if (lecturer && lecturer.role === 'lecturer') {
        // Check no existing faculty admin for this faculty
        const existing = await User.findOne({ role: 'faculty_admin', faculty: name });
        if (!existing) {
          lecturer.role = 'faculty_admin';
          lecturer.faculty = name;
          await lecturer.save();
          faculty.facultyAdmin = lecturer._id;
          await faculty.save();

          // Notify the new faculty admin
          await notifyUser(lecturer._id, {
            type: 'general',
            title: '🛡️ You are now a Faculty Admin',
            message: `You have been assigned as Faculty Admin for ${name}. Please set up your departments in the Faculty Panel.`,
            link: '/faculty-admin',
          });
        }
      }
    }

    const populated = await faculty.populate('facultyAdmin', 'name email avatarColor');
    res.status(201).json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== UPDATE FACULTY =====
router.put('/:id', auth, authorizeRole('admin'), async (req, res) => {
  try {
    const faculty = await Faculty.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!faculty) return res.status(404).json({ message: 'Faculty not found' });
    res.json(faculty);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== DELETE FACULTY =====
router.delete('/:id', auth, authorizeRole('admin'), async (req, res) => {
  try {
    await Faculty.findByIdAndDelete(req.params.id);
    res.json({ message: 'Faculty deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;