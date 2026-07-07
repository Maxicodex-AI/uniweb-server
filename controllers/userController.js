// controllers/userController.js

const User = require('../models/user');
const Room = require('../models/Room');

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
      name,
      email,
      password,
      role,
      faculty,
      department,
      level,
    } = req.body;


    // ===== CHECK USER =====

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        message: 'User already exists',
      });
    }


    // ===== HASH PASSWORD =====

    const hashedPassword =
      await bcrypt.hash(password, 10);


    // ===== CREATE USER =====

    const newUser = new User({

      name,
      email,
      password: hashedPassword,

      role: role || "student",

      faculty,
      department,

      level:
        role === "student"
          ? level
          : undefined,

    });

    await newUser.save();


// ===============================
    // AUTO CREATE ROOMS
    // ===============================

    // Global room — always created for everyone
    await ensureGlobalRoom();

    if (newUser.role === 'student') {
      // Student gets their class rooms (general + resources)
      await ensureStudentRooms(
        newUser.faculty,
        newUser.department,
        newUser.level
      );
    }

    if (newUser.role === 'lecturer') {
      // Lecturer gets:
      // 1. All lecturers global room
      // 2. Faculty lecturer room
      // 3. Department lecturer room
      await ensureLecturersGlobalRoom();
      await ensureLecturerRoom(newUser.faculty);
      await ensureDepartmentLecturerRoom(newUser.faculty, newUser.department);
    }


    // =======================

    res.status(201).json({

      message:
        "User registered successfully!",

      user: {

        id: newUser._id,

        name: newUser.name,

        email: newUser.email,

        role: newUser.role,

        faculty: newUser.faculty,

        department:
          newUser.department,

        level:
          newUser.level || null,

      },

    });

  } catch (error) {

    console.error(
      "❌ Registration error:",
      error
    );

    res.status(500).json({
      message: "Server error",
      error,
    });

  }
};



// =======================
// LOGIN USER
// =======================

const loginUser = async (req, res) => {
  try {

    const { email, password } = req.body;

    const user =
      await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message:
          "Invalid credentials",
      });
    }


    const isMatch =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!isMatch) {
      return res.status(400).json({
        message:
          "Invalid credentials",
      });
    }


    const token =
      jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );


    res.json({

      message: "Login successful",

      token,

      user: {

        id: user._id,

        name: user.name,

        email: user.email,

        role: user.role,

        faculty: user.faculty,

        department:
          user.department,

        level:
          user.level || null,

      },

    });

  } catch (error) {

    console.error(
      "❌ Login error:",
      error
    );

    res.status(500).json({
      message: "Server error",
      error,
    });

  }
};



// =======================
// GET CURRENT USER (/me)
// =======================

const getMe = async (req, res) => {
  try {

    if (!req.user) {
      return res.status(401).json({
        message:
          "User not found",
      });
    }

    res.json({

      id: req.user._id,

      name: req.user.name,

      email: req.user.email,

      role: req.user.role,

      faculty:
        req.user.faculty,

      department:
        req.user.department,

      level:
        req.user.level || null,

    });

  } catch (error) {

    console.error(
      "❌ getMe error:",
      error
    );

    res.status(500).json({
      message: "Server error",
      error,
    });

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
// TOGGLE HOST PERMISSION (admin only)
// =======================

const toggleHostPermission = async (req, res) => {
  try {
    const { id } = req.params;
    const { canHostLive } = req.body;

    // Find the target student
    const student = await User.findById(id);

    if (!student) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (student.role !== 'student') {
      return res.status(400).json({ message: 'Host permission only applies to students' });
    }

    // If granting permission, check the 2-per-department limit
    if (canHostLive === true) {
      const existingHosts = await User.countDocuments({
        role: 'student',
        faculty: student.faculty,
        department: student.department,
        canHostLive: true,
      });

      if (existingHosts >= 2) {
        return res.status(400).json({
          message: 'Limit reached: maximum 2 host students per department',
        });
      }
    }

    student.canHostLive = canHostLive;
    await student.save();

    res.json({
      message: `Host permission ${canHostLive ? 'granted' : 'revoked'} successfully`,
      user: student,
    });

  } catch (error) {
    console.error('❌ toggleHostPermission error:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};

// =======================
// GET LECTURERS BY FACULTY
// =======================

const getLecturersByFaculty = async (req, res) => {
  try {
    const { faculty } = req.params;
    const lecturers = await User.find({
      role: 'lecturer',
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

    // Update name if provided
    if (name) user.name = name;

    // Update avatar color if provided
    if (avatarColor) user.avatarColor = avatarColor;

    // Update email if provided and not already taken
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      user.email = email;
    }

    // Update password if provided
    if (newPassword) {
      if (!password) {
        return res.status(400).json({
          message: 'Current password is required to set a new password',
        });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
      user.password = await bcrypt.hash(newPassword, 10);
    }

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
};