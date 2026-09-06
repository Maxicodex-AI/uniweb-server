const Lesson = require('../models/Lesson');
const Course = require('../models/Course');
const Progress = require('../models/Progress');
const LearningStreak = require('../models/LearningStreak');

// ===== CREATE LESSON =====
exports.createLesson = async (req, res) => {
  try {
    const user = req.user;
    const {
      courseId, weekNumber, title, description,
      objectives, videoLinks, references, duration,
      aiSimplifiedContent, departmentType,
      // Language & Linguistics
      pronunciationExercises, phoneticsExercises, syntaxDrills, languageVocab,
      // Science & Medicine
      caseStudies, labProcedures, diagrams,
      // Arts & Performance
      scriptContent, performanceNotes, creativePrompts,
      // Agriculture
      fieldObservations, soilData,
      // Engineering & Technology
      codeExercises,
      // Business & Economics
      businessCases,
      // Journalism & Media
      articleDrafts, broadcastScripts,
    } = req.body;

    const Course = require('../models/Course');
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    // Scope check
    if (user.role === 'lecturer') {
      const isForMyDept = course.offerings.some(o =>
        o.faculty === user.faculty && o.department === user.department
      );
      const isMyCourseLecturer = course.lecturers?.some(
        l => l.toString() === user._id.toString()
      );
      if (!isForMyDept && !isMyCourseLecturer) {
        return res.status(403).json({ message: 'You can only create lessons for courses in your department' });
      }
    }

    const lesson = await Lesson.create({
      course: courseId,
      weekNumber,
      title,
      description,
      objectives: objectives || [],
      videoLinks: videoLinks || [],
      references: references || [],
      duration: duration || 5,
      uploadedBy: user._id,
      status: 'draft',
      aiSimplifiedContent: aiSimplifiedContent || null,
      departmentType: departmentType || 'general_studies',
      // Department specific
      pronunciationExercises: pronunciationExercises || [],
      phoneticsExercises: phoneticsExercises || [],
      syntaxDrills: syntaxDrills || [],
      languageVocab: languageVocab || [],
      caseStudies: caseStudies || [],
      labProcedures: labProcedures || [],
      diagrams: diagrams || [],
      scriptContent: scriptContent || null,
      performanceNotes: performanceNotes || [],
      creativePrompts: creativePrompts || [],
      fieldObservations: fieldObservations || [],
      soilData: soilData || [],
      codeExercises: codeExercises || [],
      businessCases: businessCases || [],
      articleDrafts: articleDrafts || [],
      broadcastScripts: broadcastScripts || [],
    });

    res.status(201).json(lesson);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== GET SINGLE LESSON =====
exports.getLessons = async (req, res) => {
  try {
    const { courseId } = req.params;
    const user = req.user;
    const Course = require('../models/Course');

    // Verify student has access to this course
    if (user.role === 'student') {
      const course = await Course.findOne({
        _id: courseId,
        offerings: {
          $elemMatch: {
            faculty: user.faculty,
            department: user.department,
            level: user.level,
          }
        }
      });
      if (!course) {
        return res.status(403).json({ message: 'You do not have access to this course' });
      }
    }

    // Lecturers can only see lessons for their department's courses
    if (user.role === 'lecturer') {
      const course = await Course.findOne({
        _id: courseId,
        $or: [
          { lecturers: user._id },
          { offerings: { $elemMatch: { faculty: user.faculty, department: user.department } } }
        ]
      });
      if (!course) {
        return res.status(403).json({ message: 'You do not have access to this course' });
      }
    }

    let filter = { course: courseId };

    // Students only see published lessons
    if (user.role === 'student') {
      filter.status = 'published';
    }

    const lessons = await Lesson.find(filter)
      .populate('uploadedBy', 'name role')
      .populate('approvedBy', 'name role')
      .sort({ weekNumber: 1 });

    res.json(lessons);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== GET SINGLE LESSON BY ID =====
exports.getLesson = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const lesson = await Lesson.findById(id)
      .populate('uploadedBy', 'name role')
      .populate('approvedBy', 'name role')
      .populate('course', 'code title offerings lecturers');

    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });

    const course = lesson.course;

    // Students can only view published lessons they have access to
    if (user.role === 'student') {
      if (lesson.status !== 'published') {
        return res.status(403).json({ message: 'This lesson is not yet available' });
      }
      const hasAccess = course.offerings?.some(o =>
        o.faculty === user.faculty &&
        o.department === user.department &&
        o.level === user.level
      );
      if (!hasAccess) {
        return res.status(403).json({ message: 'You do not have access to this lesson' });
      }
    }

    // Lecturers can only view lessons for their own courses / department
    if (user.role === 'lecturer') {
      const isMyCourseLecturer = course.lecturers?.some(
        l => l.toString() === user._id.toString()
      );
      const isForMyDept = course.offerings?.some(o =>
        o.faculty === user.faculty && o.department === user.department
      );
      if (!isMyCourseLecturer && !isForMyDept) {
        return res.status(403).json({ message: 'You do not have access to this lesson' });
      }
    }

    res.json(lesson);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== UPDATE LESSON =====
exports.updateLesson = async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });

    // Only uploader or admin can update
    if (lesson.uploadedBy.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin' && req.user.role !== 'faculty_admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const updateData = { ...req.body }
    delete updateData.status // status changes only via submit/review endpoints
    delete updateData.uploadedBy
    delete updateData.approvedBy

    const updated = await Lesson.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== SUBMIT FOR REVIEW =====
exports.submitForReview = async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });

    lesson.status = 'pending_review';
    await lesson.save();

    res.json({ message: 'Lesson submitted for review', lesson });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== REVIEW LESSON (faculty admin) =====
exports.reviewLesson = async (req, res) => {
  try {
    const { decision, reviewNotes, scheduledFor } = req.body;
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });

    if (decision === 'approve') {
      lesson.status = scheduledFor ? 'approved' : 'published';
      lesson.approvedBy = req.user._id;
      lesson.scheduledFor = scheduledFor || null;
      lesson.publishedAt = scheduledFor ? null : new Date();
    } else if (decision === 'reject') {
      lesson.status = 'rejected';
      lesson.reviewNotes = reviewNotes;
    } else if (decision === 'request_changes') {
      lesson.status = 'draft';
      lesson.reviewNotes = reviewNotes;
    }

    await lesson.save();

        // ===== NOTIFY LESSON UPLOADER =====
const { notifyUser, notifyStudents } = require('../utils/notificationHelper');

if (decision === 'approve') {
  await notifyUser(lesson.uploadedBy, {
    type: 'lesson_approved',
    title: scheduledFor ? '📅 Lesson Scheduled' : '✅ Lesson Approved',
    message: scheduledFor
      ? `Your lesson "${lesson.title}" has been approved and scheduled for publication.`
      : `Your lesson "${lesson.title}" has been approved and published!`,
    link: `/learning-hub/course/${lesson.course}`,
  });

  // ===== NOTIFY ENROLLED STUDENTS =====
  if (!scheduledFor) {
    const Course = require('../models/Course');
    const course = await Course.findById(lesson.course);
    if (course) {
      for (const offering of course.offerings) {
        await notifyStudents(
          { faculty: offering.faculty, department: offering.department, level: offering.level },
          {
            type: 'general',
            title: '📚 New Lesson Available',
            message: `Week ${lesson.weekNumber}: "${lesson.title}" is now available in ${course.code}`,
            link: `/learning-hub/course/${lesson.course}`,
          }
        );
      }
    }
  }
} else if (decision === 'reject') {
  await notifyUser(lesson.uploadedBy, {
    type: 'lesson_rejected',
    title: '❌ Lesson Rejected',
    message: `Your lesson "${lesson.title}" was rejected. ${reviewNotes || ''}`,
    link: '/learning-hub/create-lesson',
  });
} else if (decision === 'request_changes') {
  await notifyUser(lesson.uploadedBy, {
    type: 'lesson_rejected',
    title: '🔄 Changes Requested',
    message: `Your lesson "${lesson.title}" needs changes: ${reviewNotes || ''}`,
    link: '/learning-hub/create-lesson',
  });
}

    res.json({ message: `Lesson ${decision}d`, lesson });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== GET PENDING REVIEW QUEUE =====
exports.getPendingReview = async (req, res) => {
  try {
    const user = req.user;

    console.log('=== getPendingReview ===');
    console.log('User role:', user.role);
    console.log('User faculty:', user.faculty);
    console.log('User department:', user.department);

    // Super admin sees everything
    if (user.role === 'admin') {
      const lessons = await Lesson.find({ status: 'pending_review' })
        .populate('uploadedBy', 'name role avatarColor')
        .populate('course', 'code title')
        .sort({ createdAt: 1 });
      console.log('Admin sees:', lessons.length, 'lessons');
      return res.json(lessons);
    }

    // Department admin
    if (user.role === 'department_admin') {
      const User = require('../models/user');
      const Course = require('../models/Course');

      // Get all lecturers in same faculty AND department
      const deptLecturers = await User.find({
        faculty: user.faculty,
        department: user.department,
      }).select('_id');

      console.log('Lecturers in dept:', deptLecturers.length);

      // Get all courses in same faculty AND department
      const deptCourses = await Course.find({
        $or: [
          {
            offerings: {
              $elemMatch: {
                faculty: user.faculty,
                department: user.department,
              }
            }
          },
          { createdBy: { $in: deptLecturers.map(l => l._id) } }
        ]
      }).select('_id');

      console.log('Courses in dept:', deptCourses.length);

      // Find ALL pending lessons by dept members OR for dept courses
      const lessons = await Lesson.find({
        status: 'pending_review',
        $or: [
          { uploadedBy: { $in: deptLecturers.map(l => l._id) } },
          { course: { $in: deptCourses.map(c => c._id) } },
        ],
      })
        .populate('uploadedBy', 'name role avatarColor')
        .populate('course', 'code title')
        .sort({ createdAt: 1 });

      console.log('Pending lessons for dept admin:', lessons.length);
      return res.json(lessons);
    }

    // Faculty admin
    if (user.role === 'faculty_admin') {
      const User = require('../models/user');
      const Course = require('../models/Course');

      const facultyUsers = await User.find({
        faculty: user.faculty,
      }).select('_id');

      const facultyCourses = await Course.find({
        offerings: { $elemMatch: { faculty: user.faculty } }
      }).select('_id');

      const lessons = await Lesson.find({
        status: 'pending_review',
        $or: [
          { uploadedBy: { $in: facultyUsers.map(u => u._id) } },
          { course: { $in: facultyCourses.map(c => c._id) } },
        ],
      })
        .populate('uploadedBy', 'name role avatarColor')
        .populate('course', 'code title')
        .sort({ createdAt: 1 });

      console.log('Pending lessons for faculty admin:', lessons.length);
      return res.json(lessons);
    }

    res.json([]);

  } catch (error) {
    console.error('getPendingReview error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== UPDATE PROGRESS =====
exports.updateProgress = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { step } = req.body;
    const user = req.user;

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });

    let progress = await Progress.findOne({ student: user._id, lesson: lessonId });
    if (!progress) {
      progress = await Progress.create({
        student: user._id,
        course: lesson.course,
        lesson: lessonId,
      });
    }

    // Mark step as completed
    if (step && progress.stepsCompleted.hasOwnProperty(step)) {
  progress.stepsCompleted[step] = true;
}

    // Calculate completion percentage
    const steps = Object.values(progress.stepsCompleted);
    const completed = steps.filter(Boolean).length;
    progress.completionPercentage = Math.round((completed / steps.length) * 100);
    progress.lastAccessedAt = new Date();

    await progress.save();

    // Update learning streak
    await updateStreak(user._id);

    res.json(progress);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== GET PROGRESS =====
exports.getProgress = async (req, res) => {
  try {
    const { courseId } = req.params;
    const progress = await Progress.find({
      student: req.user._id,
      course: courseId,
    });
    res.json(progress);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Helper: update learning streak
async function updateStreak(userId) {
  try {
    let streak = await LearningStreak.findOne({ student: userId });
    if (!streak) {
      streak = await LearningStreak.create({ student: userId });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastActivity = streak.lastActivityDate
      ? new Date(streak.lastActivityDate)
      : null;
    if (lastActivity) lastActivity.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (!lastActivity || lastActivity < yesterday) {
      // Streak broken or starting fresh
      streak.currentStreak = 1;
    } else if (lastActivity.getTime() === yesterday.getTime()) {
      // Consecutive day
      streak.currentStreak += 1;
    }
    // If lastActivity === today, no change

    streak.lastActivityDate = new Date();
    streak.totalStudyDays += 1;
    if (streak.currentStreak > streak.longestStreak) {
      streak.longestStreak = streak.currentStreak;
    }

    // Update weekly activity (0=Mon, 6=Sun)
    const dayOfWeek = (today.getDay() + 6) % 7;
    streak.weeklyActivity[dayOfWeek] = true;

    await streak.save();
  } catch (err) {
    console.error('Streak update error:', err);
  }
}