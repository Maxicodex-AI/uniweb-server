const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const {
  createQuiz,
  getQuizByLesson,
  updateQuiz,
  publishQuiz,
  submitQuiz,
  getMyAttempt,
  getAllAttempts,
  deleteQuiz,
} = require('../controllers/quizController');

// Create quiz (lecturer, dept_admin, faculty_admin, admin)
router.post('/', auth, authorizeRole('lecturer', 'department_admin', 'faculty_admin', 'admin'), createQuiz);

// Get quiz for a lesson
router.get('/lesson/:lessonId', auth, getQuizByLesson);

// Update quiz
router.put('/:id', auth, authorizeRole('lecturer', 'department_admin', 'faculty_admin', 'admin'), updateQuiz);

// Publish quiz
router.put('/:id/publish', auth, authorizeRole('lecturer', 'department_admin', 'faculty_admin', 'admin'), publishQuiz);

// Submit quiz attempt (students)
router.post('/:quizId/submit', auth, authorizeRole('student'), submitQuiz);

// Get my attempt
router.get('/:quizId/my-attempt', auth, getMyAttempt);

// Get all attempts (lecturer/admin)
router.get('/:quizId/attempts', auth, authorizeRole('lecturer', 'department_admin', 'faculty_admin', 'admin'), getAllAttempts);

// Delete quiz
router.delete('/:id', auth, authorizeRole('department_admin', 'faculty_admin', 'admin'), deleteQuiz);

module.exports = router;