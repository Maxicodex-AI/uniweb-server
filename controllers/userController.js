const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {
  ensureGlobalRoom,
  ensureLecturersGlobalRoom,
  ensureLecturerRoom,
  ensureDepartmentLecturerRoom,
  ensureStudentRooms,
} = require('../utils/roomHelpers');

// =======================
// REGISTER USER
// =======================

const registerUser = async (req, res) => {
  try {
    const {
      name, email, password, role,
      faculty, department, level,
    } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: role || 'student',
      faculty,
      department,
      level: role === 'student' ? level : undefined,
      dateOfBirth: req.body.dateOfBirth || undefined,
      phone: req.body.phone || undefined,
      regNumber: role === 'student' ? req.body.regNumber || undefined : undefined,
      staffId: role === 'lecturer' ? req.body.staffId || undefined : undefined,
    });

    await newUser.save();

    // AUTO CREATE ROOMS
    await ensureGlobalRoom();

    if (newUser.role === 'student') {
      await ensureStudentRooms(newUser.faculty, newUser.department, newUser.level);
    }

    if (newUser.role === 'lecturer') {
      await ensureLecturersGlobalRoom();
      await ensureLecturerRoom(newUser.faculty);
      await ensureDepartmentLecturerRoom(newUser.faculty, newUser.department);
    }

    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        faculty: newUser.faculty,
        department: newUser.department,
        level: newUser.level,
      },
    });

  } catch (error) {
    console.error('❌ registerUser error:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};


// =======================
// LOGIN USER
// =======================

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        faculty: user.faculty,
        department: user.department,
        level: user.level,
      },
    });

  } catch (error) {
    console.error('❌ loginUser error:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};


// =======================
// GET ME
// =======================

const getMe = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }
    res.json({
      id: req.user._id,
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      faculty: req.user.faculty,
      department: req.user.department,
      level: req.user.level || null,
      canHostLive: req.user.canHostLive || false,
      avatarColor: req.user.avatarColor || '#16a34a',
      firstLogin: req.user.firstLogin || false,
      verified: req.user.verified || false,
      graduated: req.user.graduated || false,
      regNumber: req.user.regNumber || null,
      staffId: req.user.staffId || null,
      dateOfBirth: req.user.dateOfBirth || null,
      phone: req.user.phone || null,
    });
  } catch (error) {
    console.error('❌ getMe error:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};


// =======================
// GET ALL USERS (admin only)
// =======================

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ role: 1, name: 1 });
    res.json(users);
  } catch (error) {
    console.error('❌ getAllUsers error:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};


// =======================
// TOGGLE HOST PERMISSION
// =======================

const toggleHostPermission = async (req, res) => {
  try {
    const { id } = req.params;
    const { canHostLive } = req.body;
    const requestingUser = req.user;

    const student = await User.findById(id);
    if (!student) return res.status(404).json({ message: 'User not found' });
    if (student.role !== 'student') return res.status(400).json({ message: 'Only students can be granted host permission' });

    // Faculty admin scope check
    if (requestingUser.role === 'faculty_admin') {
      if (student.faculty !== requestingUser.faculty) {
        return res.status(403).json({ message: 'You can only manage students in your own faculty' });
      }
    }

    // Department admin scope check
    if (requestingUser.role === 'department_admin') {
      if (student.faculty !== requestingUser.faculty || student.department !== requestingUser.department) {
        return res.status(403).json({ message: 'You can only manage students in your own department' });
      }
    }

    // STRICT 2-per-department limit when granting
    if (canHostLive === true) {
      // Don't count the student themselves if they already have permission
      const existingHosts = await User.countDocuments({
        role: 'student',
        faculty: student.faculty,
        department: student.department,
        level: student.level,
        canHostLive: true,
        _id: { $ne: student._id }, // exclude self
      });

      if (existingHosts >= 2) {
        return res.status(400).json({
          message: `Maximum 2 student hosts allowed per department. ${student.department} already has ${existingHosts} host(s). Please demote one before granting to another.`,
        });
      }
    }

    student.canHostLive = canHostLive;
    await student.save();

    res.json({
      message: `Host permission ${canHostLive ? 'granted to' : 'revoked from'} ${student.name}`,
      user: student,
    });

  } catch (error) {
    console.error('❌ toggleHostPermission error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


// =======================
// GET LECTURERS BY FACULTY
// =======================

const getLecturersByFaculty = async (req, res) => {
  try {
    const { faculty } = req.params;
    const lecturers = await User.find({
      role: { $in: ['lecturer', 'faculty_admin'] },
      faculty: faculty,
    }).select('-password');
    res.json(lecturers);
  } catch (error) {
    console.error('❌ getLecturersByFaculty error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


// =======================
// UPDATE PROFILE
// =======================

const updateProfile = async (req, res) => {
  try {
    const { name, email, password, newPassword, avatarColor } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (name) user.name = name;
    if (avatarColor) user.avatarColor = avatarColor;

    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      user.email = email;
    }

    if (newPassword) {
      if (!password) {
        return res.status(400).json({ message: 'Current password is required' });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
      user.password = await bcrypt.hash(newPassword, 10);
    }

    if (req.body.phone !== undefined) user.phone = req.body.phone;
    if (req.body.dateOfBirth !== undefined) user.dateOfBirth = req.body.dateOfBirth;
    if (req.body.regNumber !== undefined) user.regNumber = req.body.regNumber;
    if (req.body.staffId !== undefined) user.staffId = req.body.staffId;

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        faculty: user.faculty,
        department: user.department,
        level: user.level,
        avatarColor: user.avatarColor,
      },
    });

  } catch (error) {
    console.error('❌ updateProfile error:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};


// =======================
// MARK FIRST LOGIN DONE
// =======================

const markFirstLoginDone = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { firstLogin: false });
    res.json({ message: 'First login marked done' });
  } catch (error) {
    console.error('❌ markFirstLoginDone error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


// =======================
// PROMOTE TO ADMIN
// =======================

const promoteToAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ message: 'User is already an admin' });

    user.role = 'admin';
    await user.save();

    res.json({ message: `${user.name} has been promoted to Super Admin`, user });

  } catch (error) {
    console.error('❌ promoteToAdmin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


// =======================
// PROMOTE TO FACULTY ADMIN
// =======================

const promoteToFacultyAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'lecturer') {
      return res.status(400).json({ message: 'Only lecturers can be promoted to faculty admin' });
    }

    // Check if a faculty admin already exists for this faculty
    const existingFacultyAdmin = await User.findOne({
      role: 'faculty_admin',
      faculty: user.faculty,
    });

    if (existingFacultyAdmin) {
      return res.status(400).json({
        message: `${existingFacultyAdmin.name} is already the Faculty Admin for ${user.faculty}. Demote them first before promoting a new one.`,
      });
    }

    user.role = 'faculty_admin';
    await user.save();

    const { ensureFacultyBulletinRoom } = require('../utils/roomHelpers');
    await ensureFacultyBulletinRoom(user.faculty);

    res.json({
      message: `${user.name} has been promoted to Faculty Admin for ${user.faculty}`,
      user,
    });

  } catch (error) {
    console.error('❌ promoteToFacultyAdmin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


// =======================
// DEMOTE FROM ADMIN
// =======================

const demoteFromAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'admin' && user.role !== 'faculty_admin') {
      return res.status(400).json({ message: 'User is not an admin' });
    }

    user.role = 'lecturer';
    await user.save();

    res.json({ message: `${user.name} has been demoted back to lecturer`, user });

  } catch (error) {
    console.error('❌ demoteFromAdmin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// =======================
// PROMOTE TO DEPARTMENT ADMIN
// =======================

const promoteToDepartmentAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const requestingUser = req.user;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role !== 'lecturer') {
      return res.status(400).json({ message: 'Only lecturers can be promoted to department admin' });
    }

    // Faculty admin can only promote lecturers in their own faculty
    if (requestingUser.role === 'faculty_admin') {
      if (user.faculty !== requestingUser.faculty) {
        return res.status(403).json({ message: 'You can only promote lecturers in your own faculty' });
      }
    }

    // Check if a department admin already exists for this department
    const existingDeptAdmin = await User.findOne({
      role: 'department_admin',
      faculty: user.faculty,
      department: user.department,
    });

    if (existingDeptAdmin) {
      return res.status(400).json({
        message: `${existingDeptAdmin.name} is already the Department Admin for ${user.department}. Demote them first before promoting a new one.`,
      });
    }

    user.role = 'department_admin';
    await user.save();

    res.json({
      message: `${user.name} has been promoted to Department Admin for ${user.department}`,
      user,
    });

  } catch (error) {
    console.error('❌ promoteToDepartmentAdmin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


// =======================
// DEMOTE DEPARTMENT ADMIN
// =======================

const demoteDepartmentAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const requestingUser = req.user;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role !== 'department_admin') {
      return res.status(400).json({ message: 'User is not a department admin' });
    }

    // Faculty admin can only demote department admins in their own faculty
    if (requestingUser.role === 'faculty_admin') {
      if (user.faculty !== requestingUser.faculty) {
        return res.status(403).json({ message: 'You can only demote department admins in your own faculty' });
      }
    }

    user.role = 'lecturer';
    await user.save();

    res.json({ message: `${user.name} has been demoted back to lecturer`, user });

  } catch (error) {
    console.error('❌ demoteDepartmentAdmin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


// =======================
// EXPORT
// =======================

module.exports = {
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
};