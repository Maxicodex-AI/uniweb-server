const Department = require('../models/Department');
const {
  ensureGlobalRoom,
  ensureLecturersGlobalRoom,
  ensureLecturerRoom,
  ensureDepartmentLecturerRoom,
  ensureStudentRooms,
} = require('../utils/roomHelpers');

// ================= CREATE DEPARTMENT =================

exports.createDepartment = async (req, res) => {
  try {

    const { name, faculty, maxLevel } = req.body;

    const dept = await Department.create({
      name,
      faculty,
      maxLevel,
    });

    // Create student rooms for each level
    const levels = ['100L', '200L', '300L', '400L', '500L', '600L'];
    for (let lvl of levels) {
      const levelNumber = parseInt(lvl);
      if (levelNumber <= maxLevel) {
        await ensureStudentRooms(faculty, name, lvl);
      }
    }

    // Create lecturer rooms
    await ensureLecturersGlobalRoom();
    await ensureLecturerRoom(faculty);
    await ensureDepartmentLecturerRoom(faculty, name);

    // Global room
    await ensureGlobalRoom();

    res.json(dept);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================= GET DEPARTMENTS =================

exports.getDepartments = async (req, res) => {
  try {
    const depts = await Department.find();
    res.json(depts);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};