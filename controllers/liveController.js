const Live = require('../models/Live');

// =========================
// START LIVE
// =========================

exports.startLive = async (req, res) => {
  try {

    const user = req.user;
    const io = req.app.get("io");

    // Check permission
        const canStart =
      user.role === "lecturer" ||
      user.role === "admin" ||
      user.role === "faculty_admin" ||
      user.role === "department_admin" ||
      (user.role === "student" && user.canHostLive === true);

    if (!canStart) {
      return res.status(403).json({
        message: "You don't have permission to start a live session",
      });
    }

    // For students — use their own profile
        // For students — use their own profile
    if (user.role === "student" && user.canHostLive) {
      const activeLive = await Live.findOne({
        'targets.faculty': user.faculty,
        'targets.department': user.department,
        level: user.level,
        isActive: true,
      });

      if (activeLive) {
        return res.status(400).json({
          message: "A live session is already running for your class",
        });
      }

      const live = await Live.create({
        title: req.body.title,
        level: user.level,
        targets: [{ faculty: user.faculty, department: user.department }],
        faculty: user.faculty,
        department: user.department,
        host: user._id,
        status: "live",
        isActive: true,
      });

      const populated = await live.populate("host", "name role");

      if (req.body.lecturerEmail) {
        const { sendLiveInvite } = require('../utils/emailHelper');
        const User = require('../models/user');
        const lecturer = await User.findOne({
          email: req.body.lecturerEmail,
          role: "lecturer",
        });
        await sendLiveInvite({
          lecturerEmail: req.body.lecturerEmail,
          lecturerName: lecturer ? lecturer.name : null,
          studentName: user.name,
          liveTitle: req.body.title,
          liveId: live._id,
        });
      }

      io.emit("liveStarted", populated);

          // Notify students about live session
    const { notifyStudents, notifyLecturers } = require('../utils/notificationHelper');
    for (const target of targets) {
      await notifyStudents(
        { faculty: target.faculty, department: target.department, level },
        {
          type: 'live_started',
          title: '📡 Live Class Started',
          message: `${user.name} started a live session: "${req.body.title}"`,
          link: `/live`,
          data: { liveId: live._id },
        }
      );
    }
    // Notify lecturers in same faculty
    await notifyLecturers(targets[0].faculty, {
      type: 'live_started',
      title: '📡 Live Class Started',
      message: `${user.name} started: "${req.body.title}"`,
      link: `/live`,
    });

      return res.json(populated);
    }    

    // For lecturers/admins — use targets array from request body
    const { title, level, targets } = req.body;

    if (!title || !level || !targets || targets.length === 0) {
      return res.status(400).json({
        message: 'Please provide title, level and at least one faculty/department target',
      });
    }

    // Check no active live for any of the targets at this level
    for (const target of targets) {
      const activeLive = await Live.findOne({
        'targets.faculty': target.faculty,
        'targets.department': target.department,
        level,
        isActive: true,
      });

      if (activeLive) {
        return res.status(400).json({
          message: `A live session is already running for ${target.department} (${target.faculty}) at ${level}`,
        });
      }
    }

    const live = await Live.create({
      title,
      level,
      targets,
      // Store first target as primary faculty/department for lecturer filtering
      faculty: targets[0].faculty,
      department: targets[0].department,
      host: user._id,
      status: "live",
      isActive: true,
    });

    const populated = await live.populate("host", "name role");

    io.emit("liveStarted", populated);

    res.json(populated);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};



// =========================
// GET LIVE
// =========================

exports.getLive = async (req, res) => {
  try {
    const user = req.user;
    let filter = {};

    if (user.role === 'admin') {
      // Super admin sees all
      filter = { isActive: true };

    } else if (user.role === 'faculty_admin') {
      // Faculty admin sees only live sessions targeting their faculty
      filter = {
        isActive: true,
        'targets.faculty': user.faculty,
      };

    } else if (user.role === 'department_admin') {
      // Department admin sees only live sessions targeting their faculty
      filter = {
        isActive: true,
        'targets.faculty': user.faculty,
      };

    } else if (user.role === 'lecturer') {
      // Lecturers see live sessions in their faculty only
      filter = {
        isActive: true,
        'targets.faculty': user.faculty,
      };

    } else if (user.role === 'student') {
      // Students only see live sessions matching their faculty + department + level
      filter = {
        isActive: true,
        level: user.level,
        targets: {
          $elemMatch: {
            faculty: user.faculty,
            department: user.department,
          }
        }
      };
    }

    const live = await Live.find(filter)
      .populate('host', 'name role')
      .sort({ createdAt: -1 });

    res.json(live);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};


// =========================
// END LIVE
// =========================

exports.endLive = async (req, res) => {
  try {
    const io = req.app.get("io");
    const user = req.user;

    const live = await Live.findById(req.params.id);

    if (!live) {
      return res.status(404).json({ message: "Live not found" });
    }

    // Only admin or the original host can end a live session
    const isHost = live.host.toString() === user._id.toString();
    const isAdmin = user.role === "admin";

    if (!isHost && !isAdmin) {
      return res.status(403).json({
        message: "Only the host or an admin can end this live session",
      });
    }

    const updatedLive = await Live.findByIdAndUpdate(
      req.params.id,
      {
        status: "ended",
        isActive: false,
        endedAt: new Date(),
      },
      { new: true }
    );

    io.emit("liveEnded", updatedLive);

    res.json({ message: "Live ended", live: updatedLive });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};



// =========================
// JOIN LIVE
// =========================

exports.joinLive = async (req, res) => {
  try {

    const { id } = req.params;
    const user = req.user;

    const live = await Live.findById(id).populate("host", "name role");

    if (!live) {
      return res.status(404).json({ message: "Live not found" });
    }

    if (!live.isActive) {
      return res.status(400).json({ message: "Live not active" });
    }

    // ===== SCOPE CHECK =====
    if (user.role === "admin") {
      // Admin can join any live
    } else if (user.role === "lecturer") {
      // Lecturers can join any live session
    } else if (user.role === "student") {
      // Students can only join if their faculty+department+level matches
      const isTarget = live.targets.some(
        t => t.faculty === user.faculty && t.department === user.department
      );
      if (!isTarget || live.level !== user.level) {
        return res.status(403).json({
          message: "You are not allowed to join this live session",
        });
      }
    }

    res.json({ message: "Joined live", live });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};