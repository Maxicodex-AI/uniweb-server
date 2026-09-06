const Timetable = require('../models/Timetable');

// ===== GET TIMETABLE =====
exports.getTimetable = async (req, res) => {
  try {
    const user = req.user;
    const { faculty, department, level, semester } = req.query;
    let filter = {};

    if (user.role === 'admin') {
      // Super admin does NOT see timetables — redirect them
      return res.json([]);

    } else if (user.role === 'faculty_admin') {
      // Faculty admin sees any department in their faculty
      filter = { faculty: user.faculty };
      if (department) filter.department = department;
      if (level) filter.level = level;
      if (semester) filter.semester = semester;

    } else if (user.role === 'department_admin') {
      // Dept admin only sees their own department
      filter = {
        faculty: user.faculty,
        department: user.department,
      };
      if (level) filter.level = level;
      if (semester) filter.semester = semester;

    } else if (user.role === 'lecturer') {
      // Lecturer sees their department timetable
      filter = {
        faculty: user.faculty,
        department: user.department,
        isPublished: true,
      };
      if (level) filter.level = level;

    } else if (user.role === 'student') {
      // Students only see their own published timetable
      filter = {
        faculty: user.faculty,
        department: user.department,
        level: user.level,
        isPublished: true,
      };
      if (semester) filter.semester = semester;
    }

    const timetables = await Timetable.find(filter)
      .populate('createdBy', 'name role')
      .populate('lastUpdatedBy', 'name role')
      .sort({ level: 1 });

    res.json(timetables);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== CREATE TIMETABLE =====
exports.createTimetable = async (req, res) => {
  try {
    const user = req.user;
    const { faculty, department, level, semester, entries } = req.body;

    // Use user's faculty/department if not provided
    const tFaculty = faculty || user.faculty;
    const tDepartment = department || user.department;

    // Check permission scope
    if (user.role === 'department_admin') {
      if (tFaculty !== user.faculty || tDepartment !== user.department) {
        return res.status(403).json({ message: 'You can only manage your own department timetable' });
      }
    }

    // Check if timetable already exists
    const existing = await Timetable.findOne({
      faculty: tFaculty,
      department: tDepartment,
      level,
      semester,
    });

    if (existing) {
      return res.status(400).json({
        message: 'Timetable already exists for this department/level/semester. Update it instead.',
        timetableId: existing._id,
      });
    }

    const timetable = await Timetable.create({
      faculty: tFaculty,
      department: tDepartment,
      level,
      semester,
      entries: entries || [],
      createdBy: user._id,
      lastUpdatedBy: user._id,
      isPublished: false,
    });

    res.status(201).json(timetable);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== UPDATE TIMETABLE =====
exports.updateTimetable = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { entries, isPublished, semester } = req.body;

    const timetable = await Timetable.findById(id);
    if (!timetable) return res.status(404).json({ message: 'Timetable not found' });

    // Scope check for student reps
    if (user.role === 'student') {
      if (!user.canHostLive) {
        return res.status(403).json({ message: 'Only class representatives can update the timetable' });
      }
      if (timetable.faculty !== user.faculty ||
        timetable.department !== user.department ||
        timetable.level !== user.level) {
        return res.status(403).json({ message: 'You can only update your own class timetable' });
      }
    }

    // Dept admin scope check
    if (user.role === 'department_admin') {
      if (timetable.faculty !== user.faculty || timetable.department !== user.department) {
        return res.status(403).json({ message: 'You can only manage your own department' });
      }
    }

    if (entries !== undefined) timetable.entries = entries;
    if (isPublished !== undefined) timetable.isPublished = isPublished;
    if (semester) timetable.semester = semester;
    timetable.lastUpdatedBy = user._id;

    await timetable.save();

    const populated = await timetable.populate(['createdBy', 'lastUpdatedBy']);
    res.json(populated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== ADD ENTRY =====
exports.addEntry = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const entry = req.body;

    const timetable = await Timetable.findById(id);
    if (!timetable) return res.status(404).json({ message: 'Timetable not found' });

    timetable.entries.push(entry);
    timetable.lastUpdatedBy = user._id;
    await timetable.save();

    res.json(timetable);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== REMOVE ENTRY =====
exports.removeEntry = async (req, res) => {
  try {
    const { id, entryId } = req.params;

    const timetable = await Timetable.findById(id);
    if (!timetable) return res.status(404).json({ message: 'Timetable not found' });

    timetable.entries = timetable.entries.filter(e => e._id.toString() !== entryId);
    timetable.lastUpdatedBy = req.user._id;
    await timetable.save();

    res.json(timetable);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== PUBLISH TIMETABLE =====
exports.publishTimetable = async (req, res) => {
  try {
    const timetable = await Timetable.findByIdAndUpdate(
      req.params.id,
      { isPublished: true, lastUpdatedBy: req.user._id },
      { new: true }
    );
    if (!timetable) return res.status(404).json({ message: 'Timetable not found' });
    res.json({ message: 'Timetable published!', timetable });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== DELETE TIMETABLE =====
exports.deleteTimetable = async (req, res) => {
  try {
    await Timetable.findByIdAndDelete(req.params.id);
    res.json({ message: 'Timetable deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};