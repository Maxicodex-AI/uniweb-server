const Announcement = require('../models/Announcement');

// CREATE announcement (lecturer/admin)
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
    } = req.body;

    const announcement = await Announcement.create({
      title,
      content,
      faculty,
      department,
      level,
      link,
      videoUrl,
      author: req.user._id,
    });

    res.status(201).json({
      message: 'Announcement created successfully',
      announcement,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET announcements (auto filter by role)
exports.getAnnouncements = async (req, res) => {
  try {
    const user = req.user;

    let filter = {};

    // Admin → see all
    if (user.role === "admin") {
      filter = {};
    }

    // Lecturer → see faculty announcements
    else if (user.role === "lecturer") {
      filter = {
        faculty: user.faculty,
      };
    }

    // Student → see faculty + department + level
    else if (user.role === "student") {
      filter = {
        faculty: user.faculty,
        department: user.department,
        level: user.level,
      };
    }

    const announcements = await Announcement.find(filter)
      .sort({ createdAt: -1 })
      .populate("author", "name role");

    res.json(announcements);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};