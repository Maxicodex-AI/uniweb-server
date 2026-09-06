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
  promoteToAdmin,
  promoteToFacultyAdmin,
  demoteFromAdmin,
  promoteToDepartmentAdmin,
  demoteDepartmentAdmin,
} = require('../controllers/userController');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');


// ================= PUBLIC ROUTES =================

// Register new user
router.post('/register', registerUser);

// Login user and return JWT
router.post('/login', loginUser);


// ================= PROTECTED ROUTES (no ID param) =================
// These must come BEFORE /:id routes to avoid Express matching them as IDs

// Get current logged-in user info
router.get('/me', auth, getMe);

// Update profile (any logged-in user)
router.put('/profile', auth, updateProfile);

// Mark first login as done
router.put('/first-login', auth, markFirstLoginDone);

// Get all users (admin, faculty_admin, department_admin)
router.get('/all', auth, authorizeRole('admin', 'faculty_admin', 'department_admin'), getAllUsers);

// Get lecturers by faculty (any logged-in user)
router.get('/lecturers/:faculty', auth, getLecturersByFaculty);


// ================= /:id ROUTES =================

// Toggle host permission for a student (admin, faculty_admin, department_admin)
router.put('/:id/host-permission', auth, authorizeRole('admin', 'faculty_admin', 'department_admin'), toggleHostPermission);

// Promote user to super admin (super admin only)
router.put('/:id/promote-admin', auth, authorizeRole('admin'), promoteToAdmin);

// Promote lecturer to faculty admin (super admin only)
router.put('/:id/promote-faculty-admin', auth, authorizeRole('admin'), promoteToFacultyAdmin);

// Demote admin/faculty_admin back to lecturer (super admin only)
router.put('/:id/demote-admin', auth, authorizeRole('admin'), demoteFromAdmin);

// Promote lecturer to department admin (admin or faculty_admin)
router.put('/:id/promote-department-admin', auth, authorizeRole('admin', 'faculty_admin'), promoteToDepartmentAdmin);

// Demote department admin back to lecturer (admin or faculty_admin)
router.put('/:id/demote-department-admin', auth, authorizeRole('admin', 'faculty_admin'), demoteDepartmentAdmin);

// Public stats (no auth)
router.get('/stats', async (req, res) => {
  try {
    const User = require('../models/user');
    const Department = require('../models/Department');

    const [students, lecturers, departments] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: { $in: ['lecturer', 'faculty_admin', 'department_admin'] } }),
      Department.countDocuments(),
    ]);

    const faculties = await Department.distinct('faculty');

    res.json({
      students,
      lecturers,
      departments,
      faculties: faculties.length,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update profile (name, avatarColor)
router.put('/me/update', auth, async (req, res) => {
  try {
    const { name, avatarColor } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, avatarColor },
      { new: true }
    ).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Change password
router.put('/me/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const bcrypt = require('bcryptjs');
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect' });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update notification preferences
router.put('/me/notifications', auth, async (req, res) => {
  try {
    const { notifLive, notifAnnouncement, notifLesson, notifQuiz } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { notifLive, notifAnnouncement, notifLesson, notifQuiz },
      { new: true }
    ).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Global search
router.get('/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json({ courses: [], announcements: [], users: [], lessons: [] });
    }

    const user = req.user;
    const regex = new RegExp(q.trim(), 'i');

    const Course = require('../models/Course');
    const Announcement = require('../models/Announcement');
    const Lesson = require('../models/Lesson');

    // Search courses scoped to user
    let courseFilter = { $or: [{ title: regex }, { code: regex }] };
    if (user.role === 'student') {
      courseFilter = {
        ...courseFilter,
        offerings: {
          $elemMatch: {
            faculty: user.faculty,
            department: user.department,
            level: user.level,
          }
        }
      };
    } else if (user.role === 'lecturer' || user.role === 'department_admin') {
      courseFilter = {
        ...courseFilter,
        offerings: { $elemMatch: { faculty: user.faculty, department: user.department } },
      };
    } else if (user.role === 'faculty_admin') {
      courseFilter = {
        ...courseFilter,
        offerings: { $elemMatch: { faculty: user.faculty } },
      };
    }

    // Search announcements
    let annFilter = { $or: [{ title: regex }, { content: regex }] };

    // Search lessons
    let lessonFilter = { title: regex, status: 'published' };
    if (user.role === 'student') {
      lessonFilter = { ...lessonFilter };
    }

    // Search users (staff only)
    let userResults = [];
    if (user.role !== 'student') {
      userResults = await User.find({
        $or: [{ name: regex }, { email: regex }],
        faculty: user.faculty,
      }).select('name email role department faculty avatarColor').limit(5);
    }

    const [courses, announcements, lessons] = await Promise.all([
      Course.find(courseFilter).select('code title').limit(5),
      Announcement.find(annFilter).select('title faculty createdAt').limit(5),
      Lesson.find(lessonFilter).select('title weekNumber course status').populate('course', 'code title').limit(5),
    ]);

    res.json({ courses, announcements, users: userResults, lessons });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;