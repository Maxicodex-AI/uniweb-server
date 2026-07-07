const express = require('express');
const router = express.Router();
const authorizeRole = require('../middleware/authorizeRole');

const auth = require('../middleware/auth');

const {
  createDepartment,
  getDepartments,
} = require('../controllers/departmentController');


router.post('/', auth, authorizeRole('admin'), createDepartment);

// Public — no auth required, needed for register form dropdowns
router.get('/', getDepartments);


module.exports = router;