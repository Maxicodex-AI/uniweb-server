const Announcement = require('../models/Announcement');

// ===== CREATE ANNOUNCEMENT =====
exports.createAnnouncement = async (req, res) => {
  try {
    const {
      title,
      content,
      faculty,
      department,
      level,
      link,
      videoUrl,
      priority,
    } = req.body;

    const user = req.user;

    // Faculty admin can only post to their own faculty
    if (user.role === 'faculty_admin' && faculty !== user.faculty && faculty !== 'All') {
      return res.status(403).json({
        message: 'Faculty admin can only post announcements for their own faculty',
      });
    }

    const announcement = await Announcement.create({
      title,
      content,
      faculty,
      department,
      level,
      link,
      videoUrl,
      priority: priority || 'general',
      author: user._id,
    });

    const populated = await announcement.populate('author', 'name role avatarColor');

        // Send notifications
    const { notifyStudents, notifyLecturers, notifyMany } = require('../utils/notificationHelper');
    const User = require('../models/user');

    if (faculty === 'All') {
      // Notify everyone
      const allUsers = await User.find({}).select('_id');
      await notifyMany(allUsers.map(u => u._id), {
        type: 'announcement',
        title: `📢 ${title}`,
        message: content?.slice(0, 100) || '',
        link: '/announcements',
      });
    } else {
      await notifyStudents({ faculty, department, level }, {
        type: 'announcement',
        title: `📢 ${title}`,
        message: content?.slice(0, 100) || '',
        link: '/announcements',
      });
      await notifyLecturers(faculty, {
        type: 'announcement',
        title: `📢 ${title}`,
        message: content?.slice(0, 100) || '',
        link: '/announcements',
      });
    }

    res.status(201).json({
      message: 'Announcement created successfully',
      announcement: populated,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};


exports.getAnnouncements = async (req, res) => {
  try {
    const user = req.user;
    let filter = {};

    if (user.role === 'admin') {
      // Super admin sees everything
      filter = {};

    } else if (user.role === 'faculty_admin' || user.role === 'lecturer') {
      // Lecturers and faculty admins see:
      // 1. Announcements for everyone (faculty: "All")
      // 2. Announcements for their specific faculty
      filter = {
        $or: [
          { faculty: 'All' },
          { faculty: user.faculty },
        ],
      };

    } else if (user.role === 'student') {
      // Students see:
      // 1. Announcements for everyone (faculty: "All")
      // 2. Announcements for their faculty with no department specified
      // 3. Announcements for their faculty + their department with no level specified
      // 4. Announcements for their exact faculty + department + level
      filter = {
        $or: [
          // For everyone
          { faculty: 'All' },
          // For their faculty only (no department specified)
          {
            faculty: user.faculty,
            $or: [
              { department: { $in: [null, '', undefined] } },
              { department: { $exists: false } },
            ],
            $or: [
              { level: { $in: [null, '', undefined] } },
              { level: { $exists: false } },
            ],
          },
          // For their faculty + department (no level specified)
          {
            faculty: user.faculty,
            department: user.department,
            $or: [
              { level: { $in: [null, '', undefined] } },
              { level: { $exists: false } },
            ],
          },
          // For their exact faculty + department + level
          {
            faculty: user.faculty,
            department: user.department,
            level: user.level,
          },
        ],
      };
    }

    const announcements = await Announcement.find(filter)
      .sort({ createdAt: -1 })
      .populate('author', 'name role avatarColor');

    res.json(announcements);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};


// ===== DELETE ANNOUNCEMENT =====
exports.deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const announcement = await Announcement.findById(id).populate('author', 'name role');

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    // Super admin can delete anything
    if (user.role === 'admin') {
      await Announcement.findByIdAndDelete(id);
      return res.json({
        message: 'Announcement deleted',
        deletedBy: user.name,
        deletedByRole: 'Super Admin',
      });
    }

    // Faculty admin can only delete from their own faculty
    // and cannot delete super admin posts
    if (user.role === 'faculty_admin') {
      if (announcement.faculty !== user.faculty) {
        return res.status(403).json({
          message: 'You can only delete announcements from your own faculty',
        });
      }

      // Cannot delete super admin posts
      const authorUser = await require('../models/user').findById(announcement.author);
      if (authorUser && authorUser.role === 'admin') {
        return res.status(403).json({
          message: 'Faculty admin cannot delete super admin announcements',
        });
      }

      await Announcement.findByIdAndDelete(id);
      return res.json({
        message: 'Announcement deleted',
        deletedBy: user.name,
        deletedByRole: 'Faculty Admin',
      });
    }

    return res.status(403).json({ message: 'Access denied' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};