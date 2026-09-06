const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const {
  createCourse,
  getCourses,
  getCourse,
  getMyEnrollments,
  enrollInCourse,
  updateCourse,
  deleteCourse,
} = require('../controllers/courseController');

// Get all courses (filtered by role)
router.get('/', auth, getCourses);

// Get my enrollments
router.get('/my-enrollments', auth, getMyEnrollments);

// Get single course
router.get('/:id', auth, getCourse);

// Create course (admin, faculty_admin, department_admin)
router.post('/', auth, authorizeRole('admin', 'faculty_admin', 'department_admin'), createCourse);

// Enroll in course (students)
router.post('/:courseId/enroll', auth, authorizeRole('student'), enrollInCourse);

// Update course
router.put('/:id', auth, authorizeRole('admin', 'faculty_admin', 'department_admin', 'lecturer'), updateCourse);

// Delete course (dept_admin, faculty_admin, admin)
router.delete('/:id', auth, authorizeRole('admin', 'faculty_admin', 'department_admin'), deleteCourse);

module.exports = router;