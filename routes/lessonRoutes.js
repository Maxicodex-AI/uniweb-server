const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const {
  createLesson,
  getLessons,
  getLesson,
  updateLesson,
  submitForReview,
  reviewLesson,
  getPendingReview,
  updateProgress,
  getProgress,
} = require('../controllers/lessonController');


// ================= SPECIFIC ROUTES (before /:id) =================

// Get pending review queue (department_admin, faculty_admin, admin)
router.get(
  '/pending-review',
  auth,
  authorizeRole('admin', 'faculty_admin', 'department_admin'),
  getPendingReview
);

// Get lessons for a course
router.get('/course/:courseId', auth, getLessons);

// Get progress for a course
router.get('/progress/:courseId', auth, getProgress);

// Get my lessons (lecturer's own lessons)
router.get('/my-lessons', auth, async (req, res) => {
  try {
    const Lesson = require('../models/Lesson');
    const lessons = await Lesson.find({ uploadedBy: req.user._id })
      .populate('course', 'code title')
      .sort({ updatedAt: -1 });
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ================= /:id ROUTES =================

// Get single lesson
router.get('/:id', auth, getLesson);

// Create lesson (lecturer, department_admin, faculty_admin, admin)
router.post(
  '/',
  auth,
  authorizeRole('lecturer', 'department_admin', 'faculty_admin', 'admin'),
  createLesson
);

// Update lesson
router.put('/:id', auth, updateLesson);

// Submit for review (lecturer, department_admin, faculty_admin)
router.put(
  '/:id/submit',
  auth,
  authorizeRole('lecturer', 'department_admin', 'faculty_admin', 'admin'),
  submitForReview
);

// Review lesson — APPROVE/REJECT/REQUEST CHANGES
// department_admin reviews first, faculty_admin oversees, admin can do all
router.put(
  '/:id/review',
  auth,
  authorizeRole('admin', 'faculty_admin', 'department_admin'),
  reviewLesson
);

// Update progress (students)
router.put(
  '/:lessonId/progress',
  auth,
  authorizeRole('student'),
  updateProgress
);

// Delete lesson
router.delete('/:id', auth, authorizeRole('lecturer', 'department_admin', 'faculty_admin', 'admin'), async (req, res) => {
  try {
    const Lesson = require('../models/Lesson');
    await Lesson.findByIdAndDelete(req.params.id);
    res.json({ message: 'Lesson deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all progress for a lesson (lecturer/admin view)
router.get('/:id/all-progress', auth, authorizeRole('lecturer', 'department_admin', 'faculty_admin', 'admin'), async (req, res) => {
  try {
    const Progress = require('../models/Progress');
    const progress = await Progress.find({ lesson: req.params.id })
      .populate('student', 'name email level department avatarColor')
      .sort({ updatedAt: -1 });
    res.json(progress);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;