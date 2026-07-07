const Live = require('../models/Live');


// =========================
// START LIVE
// =========================

exports.startLive = async (req, res) => {
  try {

    const user = req.user;
    const io = req.app.get("io");

    // Check permission — lecturer, admin, or student with canHostLive
    const canStart =
      user.role === "lecturer" ||
      user.role === "admin" ||
      (user.role === "student" && user.canHostLive === true);

    if (!canStart) {
      return res.status(403).json({
        message: "You don't have permission to start a live session",
      });
    }

    // Check no active live in same faculty + department
    const activeLive = await Live.findOne({
      faculty: user.faculty,
      department: user.department,
      isActive: true,
    });

    if (activeLive) {
      return res.status(400).json({
        message: "A live session is already running in this department",
      });
    }

    const live = await Live.create({
      title: req.body.title,
      faculty: user.faculty,
      department: user.department,
      level: user.level,
      host: user._id,
      status: "live",
      isActive: true,
    });

    const populated = await live.populate("host", "name role");

    // If a student is hosting, send email invite to lecturer
    if (user.role === "student" && req.body.lecturerEmail) {
      const { sendLiveInvite } = require('../utils/emailHelper');

      // Try to find lecturer by email to get their name
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

    // Emit to everyone
    io.emit("liveStarted", populated);

    res.json(populated);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Server error",
    });
  }
};



// =========================
// GET LIVE
// =========================

exports.getLive = async (req, res) => {
  try {

    const user = req.user;

    let filter = {};


    if (user.role === "admin") {

      filter = {
        isActive: true,
      };

    }

    else if (user.role === "lecturer") {

      filter = {
        faculty: user.faculty,
        isActive: true,
      };

    }

    else if (user.role === "student") {

      filter = {
        faculty: user.faculty,
        department: user.department,
        level: user.level,
        isActive: true,
      };

    }


    const live = await Live.find(filter)
      .populate(
        "host",
        "name role"
      )
      .sort({
        createdAt: -1,
      });


    res.json(live);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Server error",
    });

  }
};



// =========================
// END LIVE
// =========================

exports.endLive = async (req, res) => {
  try {

    const io = req.app.get("io");

    const live =
      await Live.findById(
        req.params.id
      );

    if (!live) {
      return res.status(404).json({
        message: "Live not found",
      });
    }


    live.status = "ended";

    live.isActive = false;

    live.endedAt = new Date();


    await live.save();


    io.emit("liveEnded", live);


    res.json({
      message: "Live ended",
      live,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Server error",
    });

  }
};



// =========================
// JOIN LIVE
// =========================

exports.joinLive = async (req, res) => {
  try {

    const { id } = req.params;
    const user = req.user;

    const live =
      await Live.findById(id)
        .populate(
          "host",
          "name role"
        );

    if (!live) {
      return res.status(404).json({
        message: "Live not found",
      });
    }

    if (!live.isActive) {
      return res.status(400).json({
        message: "Live not active",
      });
    }

    // ===== SCOPE CHECK =====
    // Admins can join any live session
    if (user.role === "admin") {
      // allowed, no restriction
    }
    // Lecturers can only join live sessions in their own faculty
    else if (user.role === "lecturer") {
      if (live.faculty !== user.faculty) {
        return res.status(403).json({
          message: "You are not allowed to join this live session",
        });
      }
    }
    // Students can only join live sessions matching their exact faculty + department + level
    else if (user.role === "student") {
      if (
        live.faculty !== user.faculty ||
        live.department !== user.department ||
        live.level !== user.level
      ) {
        return res.status(403).json({
          message: "You are not allowed to join this live session",
        });
      }
    }

    res.json({
      message: "Joined live",
      live,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Server error",
    });

  }
};