const express = require('express');
const router = express.Router();
const authorizeRole = require('../middleware/authorizeRole');

const auth = require('../middleware/auth');

const {
  createSession,
  getCurrent,
  nextSemester,
  promoteStudents,
} = require('../controllers/academicController');


router.post('/', auth, authorizeRole('admin'), createSession);

router.get('/', auth, getCurrent);

router.put('/next', auth, authorizeRole('admin'), nextSemester);
router.put('/promote', auth, authorizeRole('admin'), promoteStudents);


module.exports = router;