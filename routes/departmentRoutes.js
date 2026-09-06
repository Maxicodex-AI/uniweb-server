const express = require('express');
const router = express.Router();
const authorizeRole = require('../middleware/authorizeRole');
const auth = require('../middleware/auth');
const Department = require('../models/Department');

const {
  createDepartment,
  getDepartments,
  updateDepartment,
  deleteDepartment,
} = require('../controllers/departmentController');

// GET /api/departments/profile (must be BEFORE /:id)
router.get('/profile', async (req, res) => {
  try {
    const { faculty, name } = req.query;
    console.log('Profile route hit:', faculty, name);
    const dept = await Department.findOne({ faculty, name });
    if (!dept) return res.status(404).json({ message: 'Department not found' });
    res.json(dept);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/departments (public)
router.get('/', getDepartments);

// POST /api/departments (admin or faculty_admin)
router.post('/', auth, authorizeRole('admin', 'faculty_admin'), createDepartment);

// PUT /api/departments/:id (admin or faculty_admin)
router.put('/:id', auth, authorizeRole('admin', 'faculty_admin'), updateDepartment);

// DELETE /api/departments/:id (admin or faculty_admin)
router.delete('/:id', auth, authorizeRole('admin', 'faculty_admin'), deleteDepartment);

module.exports = router;