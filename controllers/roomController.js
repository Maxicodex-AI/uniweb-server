const Room = require('../models/Room');

// ================= GET ROOMS FOR USER =================

exports.getRooms = async (req, res) => {
  try {

    const user = req.user;
    let rooms = [];

    if (user.role === 'admin') {
      // Admin sees ALL rooms
      rooms = await Room.find().sort({ type: 1, name: 1 });

    } else if (user.role === 'lecturer') {
      // Lecturer sees:
      // 1. All lecturers global room
      // 2. Their faculty lecturer room
      // 3. Their department lecturer room
      // 4. Resources rooms for their faculty (to post study materials)
      // NOTE: students never see these lecturer rooms
      rooms = await Room.find({
        $or: [
          { type: 'global' },
          { name: 'lecturers_global' },
          { type: 'lecturer', subType: 'faculty', faculty: user.faculty },
          { type: 'lecturer', subType: 'department', faculty: user.faculty, department: user.department },
          { type: 'student', subType: 'resources', faculty: user.faculty, department: user.department },
        ],
      });

    } else if (user.role === 'student') {
      // Student sees:
      // 1. Global room (read only)
      // 2. Their class general room (can post)
      // 3. Their class resources room (read only)
      // NOTE: students NEVER see lecturer rooms
      rooms = await Room.find({
        $or: [
          { type: 'global' },
          {
            type: 'student',
            faculty: user.faculty,
            department: user.department,
            level: user.level,
          },
        ],
      });
    }

    res.json(rooms);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};