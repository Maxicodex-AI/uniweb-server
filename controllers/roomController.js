const Room = require('../models/Room');

// ================= GET ROOMS FOR USER =================

exports.getRooms = async (req, res) => {
  try {

    const user = req.user;
    let rooms = [];

    if (user.role === 'admin') {
      // Super admin sees global + resources rooms only
      // (no student general, no lecturer rooms — privacy)
      rooms = await Room.find({
        $or: [
          { type: 'global' },
          { type: 'student', subType: 'resources' },
          { type: 'bulletin' },
        ],
      });

    } else if (user.role === 'faculty_admin') {
      // Faculty admin sees ALL resources rooms across ALL departments in their faculty
      // (not limited to just their registered department)
      rooms = await Room.find({
        $or: [
          { type: 'global' },
          { type: 'bulletin', faculty: user.faculty },
          { name: 'lecturers_global' },
          { type: 'lecturer', subType: 'faculty', faculty: user.faculty },
          { type: 'lecturer', subType: 'department', faculty: user.faculty },
          // ALL resources rooms in their faculty — across all departments and levels
          { type: 'student', subType: 'resources', faculty: user.faculty },
        ],
      });

    } else if (user.role === 'department_admin') {
      // Department admin sees:
      // - global (read only)
      // - faculty bulletin (read only)
      // - lecturer rooms in their faculty/department
      // - ALL resources rooms in their department
      rooms = await Room.find({
        $or: [
          { type: 'global' },
          { type: 'bulletin', faculty: user.faculty },
          { name: 'lecturers_global' },
          { type: 'lecturer', subType: 'faculty', faculty: user.faculty },
          { type: 'lecturer', subType: 'department', faculty: user.faculty, department: user.department },
          { type: 'student', subType: 'resources', faculty: user.faculty, department: user.department },
        ],
      });

    } else if (user.role === 'student') {
      // Student sees:
      // - global (read only)
      // - faculty bulletin for their faculty (read only)
      // - their class general room (can post)
      // - their class resources room (read only)
      rooms = await Room.find({
        $or: [
          { type: 'global' },
          { type: 'bulletin', faculty: user.faculty },
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