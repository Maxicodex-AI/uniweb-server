const Academic = require('../models/Academic');
const User = require('../models/user');
const Department = require('../models/Department');
const Announcement = require('../models/Announcement');

// CREATE SESSION
exports.createSession = async (req, res) => {
  try {

    const { session, semester } = req.body;

    const academic = await Academic.create({
      session,
      semester,
    });

    res.json(academic);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};



// GET CURRENT SESSION
exports.getCurrent = async (req, res) => {
  try {

    const academic = await Academic.findOne({
      isActive: true,
    });

    res.json(academic);

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};



// NEXT SEMESTER
exports.nextSemester = async (req, res) => {
  try {

    const academic = await Academic.findOne({
      isActive: true,
    });

    if (!academic) {
      return res.status(404).json({
        message: 'No active session',
      });
    }

    if (academic.semester === 1) {
      academic.semester = 2;
    } else {
      academic.semester = 1;
      academic.promotionDone = false;
    }

    await academic.save();

    res.json(academic);

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
// PROMOTE STUDENTS (department based)
exports.promoteStudents = async (req, res) => {
  try {

    const academic = await Academic.findOne({
      isActive: true,
    });

    if (!academic) {
      return res.status(404).json({
        message: 'No active session',
      });
    }

    if (academic.promotionDone) {
      return res.json({
        message: 'Promotion already done',
      });
    }

    const students = await User.find({
      role: 'student',
      graduated: false,
    });

    // Track whether anything actually happened this cycle,
    // so we only announce things that are actually true
    let anyGraduated = false;
    let anyPromoted = false;

    for (let student of students) {

      const dept = await Department.findOne({
        name: student.department,
      });

      if (!dept) continue;

      const maxLevel = dept.maxLevel;

      const currentLevel = parseInt(student.level);

      if (currentLevel >= maxLevel) {

        student.graduated = true;
        anyGraduated = true;

      } else {

        student.level = (currentLevel + 100) + "L";
        anyPromoted = true;

      }

      await student.save();
    }

    academic.promotionDone = true;
    await academic.save();


    // ============================
    // SMART ANNOUNCEMENTS
    // ============================

    // Promotion message — only if at least one student was actually promoted
    if (anyPromoted) {
      await Announcement.create({
        title: "Promotion Completed",
        content:
          "All eligible students have been promoted to the next level. Congratulations to everyone.",
        faculty: "All",
        department: "All",
        level: "All",
      });
    }

    // Graduation message — only if at least one student actually graduated
    if (anyGraduated) {
      await Announcement.create({
        title: "Congratulations Graduates",
        content:
          "Congratulations to all final year students who successfully graduated.",
        faculty: "All",
        department: "All",
        level: "All",
      });
    }
    res.json({
      message: "Promotion process completed",
      promoted: anyPromoted,
      graduated: anyGraduated,
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'Server error',
    });
  }
};