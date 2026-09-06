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
    const { name, faculty, maxLevel, description, learningType, departmentAdminId } = req.body;

    // Scope check — faculty admin can only create in their own faculty
    if (req.user.role === 'faculty_admin' && faculty !== req.user.faculty) {
      return res.status(403).json({ message: 'You can only create departments in your own faculty' });
    }

    // Check duplicate
    const existing = await Department.findOne({ name, faculty });
    if (existing) {
      return res.status(400).json({ message: `Department "${name}" already exists in ${faculty}` });
    }

    const dept = await Department.create({
      name,
      faculty,
      maxLevel: maxLevel || 400,
      description: description || '',
      learningType: learningType || 'general_studies',
      createdBy: req.user._id,
    });

    // Create student rooms for each level up to maxLevel
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
    await ensureGlobalRoom();

    // Assign department admin if provided
    if (departmentAdminId) {
      const User = require('../models/user');
      const { notifyUser } = require('../utils/notificationHelper');

      const lecturer = await User.findById(departmentAdminId);

      if (lecturer && lecturer.role === 'lecturer') {
        // Check no existing dept admin for this department
        const existingAdmin = await User.findOne({
          role: 'department_admin',
          faculty,
          department: name,
        });

        if (!existingAdmin) {
          lecturer.role = 'department_admin';
          lecturer.faculty = faculty;
          lecturer.department = name;
          await lecturer.save();

          dept.departmentAdmin = lecturer._id;
          await dept.save();

          // Notify the new dept admin
          await notifyUser(lecturer._id, {
            type: 'general',
            title: '🏛️ You are now a Department Admin',
            message: `You have been assigned as Department Admin for ${name} (${faculty}). Please set up your courses in the Department Panel.`,
            link: '/dept-admin',
          });
        }
      }
    }

    res.json(dept);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================= GET DEPARTMENTS =================

exports.getDepartments = async (req, res) => {
  try {
    const { faculty } = req.query;
    const filter = faculty ? { faculty } : {};
    const depts = await Department.find(filter).sort({ name: 1 });
    res.json(depts);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ================= UPDATE DEPARTMENT =================

exports.updateDepartment = async (req, res) => {
  try {
    const dept = await Department.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!dept) return res.status(404).json({ message: 'Department not found' });
    res.json(dept);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ================= DELETE DEPARTMENT =================

exports.deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    const dept = await Department.findById(id);
    if (!dept) return res.status(404).json({ message: 'Department not found' });

    // Scope check for faculty admin
    if (req.user.role === 'faculty_admin' && dept.faculty !== req.user.faculty) {
      return res.status(403).json({ message: 'You can only delete departments in your own faculty' });
    }

    await Department.findByIdAndDelete(id);

    // Delete all rooms associated with this department
    const Room = require('../models/Room');
    await Room.deleteMany({
      faculty: dept.faculty,
      department: dept.name,
    });

    res.json({
      message: `Department "${dept.name}" and its rooms deleted successfully`,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};