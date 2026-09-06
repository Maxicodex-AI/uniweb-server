const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const User = require('../models/user');

// ===== CREATE COURSE =====
exports.createCourse = async (req, res) => {
  try {
    const { code, title, description, offerings, lecturers } = req.body;
    const course = await Course.create({
      code, title, description,
      offerings: offerings || [],
      lecturers: lecturers || [],
      createdBy: req.user._id,
    });
    res.status(201).json(course);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Course code already exists' });
    }
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== GET ALL COURSES =====
exports.getCourses = async (req, res) => {
  try {
    const user = req.user;
    let filter = {};

    if (user.role === 'student') {
      // Students ONLY see courses for their exact faculty/department/level
      filter = {
        offerings: {
          $elemMatch: {
            faculty: user.faculty,
            department: user.department,
            level: user.level,
          }
        },
        isActive: true,
      };
    } else if (user.role === 'lecturer') {
      // Lecturers ONLY see courses in their department
      filter = {
        $or: [
          { lecturers: user._id },
          { createdBy: user._id },
          {
            offerings: {
              $elemMatch: {
                faculty: user.faculty,
                department: user.department,
              }
            }
          }
        ],
        isActive: true,
      };
    } else if (user.role === 'department_admin') {
      // Dept admin sees their department only
      filter = {
        offerings: {
          $elemMatch: {
            faculty: user.faculty,
            department: user.department,
          }
        },
      };
    } else if (user.role === 'faculty_admin') {
      // Faculty admin sees ALL departments in their faculty
      filter = {
        offerings: { $elemMatch: { faculty: user.faculty } },
      };
    }
    // Admin sees all — no filter

    const courses = await Course.find(filter)
      .populate('lecturers', 'name email avatarColor')
      .populate('createdBy', 'name role')
      .sort({ code: 1 });

    res.json(courses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== GET SINGLE COURSE =====
exports.getCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('lecturers', 'name email avatarColor')
      .populate('createdBy', 'name role');
    if (!course) return res.status(404).json({ message: 'Course not found' });
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== GET MY ENROLLED COURSES =====
exports.getMyEnrollments = async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ student: req.user._id })
      .populate({
        path: 'course',
        populate: { path: 'lecturers', select: 'name avatarColor' }
      })
      .populate('currentLesson', 'title weekNumber')
      .sort({ updatedAt: -1 });
    res.json(enrollments);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== ENROLL IN COURSE =====
exports.enrollInCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const existing = await Enrollment.findOne({
      student: req.user._id,
      course: courseId,
    });
    if (existing) return res.status(400).json({ message: 'Already enrolled' });

    const enrollment = await Enrollment.create({
      student: req.user._id,
      course: courseId,
    });

    res.status(201).json(enrollment);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== UPDATE COURSE =====
exports.updateCourse = async (req, res) => {
  try {
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!course) return res.status(404).json({ message: 'Course not found' });
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== DELETE COURSE =====
exports.deleteCourse = async (req, res) => {
  try {
    await Course.findByIdAndDelete(req.params.id);
    res.json({ message: 'Course deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};