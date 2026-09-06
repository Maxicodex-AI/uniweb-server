const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const {
  getTimetable,
  createTimetable,
  updateTimetable,
  addEntry,
  removeEntry,
  publishTimetable,
  deleteTimetable,
} = require('../controllers/timetableController');

// Get timetable (all logged in users)
router.get('/', auth, getTimetable);

// Create timetable (dept_admin, faculty_admin, admin)
router.post('/', auth, authorizeRole('department_admin', 'faculty_admin', 'admin'), createTimetable);

// Update timetable (dept_admin, faculty_admin, admin, student reps)
router.put('/:id', auth, updateTimetable);

// Add single entry
router.post('/:id/entry', auth, updateTimetable);

// Remove entry
router.delete('/:id/entry/:entryId', auth, authorizeRole('department_admin', 'faculty_admin', 'admin'), removeEntry);

// Publish timetable
router.put('/:id/publish', auth, authorizeRole('department_admin', 'faculty_admin', 'admin'), publishTimetable);

// Delete timetable
router.delete('/:id', auth, authorizeRole('department_admin', 'faculty_admin', 'admin'), deleteTimetable);

module.exports = router;