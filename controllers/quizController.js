const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');

// ===== CREATE QUIZ =====
exports.createQuiz = async (req, res) => {
  try {
    const { lessonId, courseId, title, description, questions, timeLimit, passMark } = req.body;
    const quiz = await Quiz.create({
      lesson: lessonId,
      course: courseId,
      title,
      description,
      questions: questions || [],
      timeLimit: timeLimit || 30,
      passMark: passMark || 50,
      createdBy: req.user._id,
    });
    res.status(201).json(quiz);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== GET QUIZ FOR LESSON =====
exports.getQuizByLesson = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const quiz = await Quiz.findOne({ lesson: lessonId })
      .populate('createdBy', 'name role');

    if (!quiz) return res.status(404).json({ message: 'No quiz for this lesson' });

    // Hide correct answers from students
    if (req.user.role === 'student') {
      const sanitized = {
        ...quiz.toObject(),
        questions: quiz.questions.map(q => ({
          ...q.toObject(),
          correctAnswer: undefined,
          explanation: undefined,
        }))
      };
      return res.json(sanitized);
    }

    res.json(quiz);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== UPDATE QUIZ =====
exports.updateQuiz = async (req, res) => {
  try {
    const quiz = await Quiz.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
    res.json(quiz);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== PUBLISH QUIZ =====
exports.publishQuiz = async (req, res) => {
  try {
    const quiz = await Quiz.findByIdAndUpdate(
      req.params.id,
      { isPublished: true },
      { new: true }
    );
    res.json(quiz);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== SUBMIT QUIZ ATTEMPT =====
exports.submitQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { answers, timeTaken } = req.body;

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    // Check existing attempt
    const existing = await QuizAttempt.findOne({
      quiz: quizId,
      student: req.user._id,
    });
    if (existing) {
      return res.status(400).json({ message: 'You have already attempted this quiz' });
    }

    // Grade the answers
    let score = 0;
    let totalPoints = 0;
    const gradedAnswers = quiz.questions.map((q, index) => {
      const studentAnswer = answers[index] || '';
      const isCorrect = studentAnswer.toLowerCase().trim() === q.correctAnswer.toLowerCase().trim();
      const pointsEarned = isCorrect ? q.points : 0;
      score += pointsEarned;
      totalPoints += q.points;
      return {
        questionIndex: index,
        answer: studentAnswer,
        isCorrect,
        pointsEarned,
      };
    });

    const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
    const passed = percentage >= quiz.passMark;

    const attempt = await QuizAttempt.create({
      quiz: quizId,
      student: req.user._id,
      answers: gradedAnswers,
      score,
      totalPoints,
      percentage,
      passed,
      timeTaken,
      completedAt: new Date(),
    });

    // Return with correct answers revealed
    res.json({
      attempt,
      quiz: quiz,
      message: passed ? '🎉 Congratulations! You passed!' : '❌ You did not pass. Try again after reviewing the material.',
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== GET MY ATTEMPT =====
exports.getMyAttempt = async (req, res) => {
  try {
    const { quizId } = req.params;
    const attempt = await QuizAttempt.findOne({
      quiz: quizId,
      student: req.user._id,
    }).populate('quiz');
    res.json(attempt);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== GET ALL ATTEMPTS (for lecturer/admin) =====
exports.getAllAttempts = async (req, res) => {
  try {
    const { quizId } = req.params;
    const attempts = await QuizAttempt.find({ quiz: quizId })
      .populate('student', 'name email level department avatarColor')
      .sort({ completedAt: -1 });
    res.json(attempts);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== DELETE QUIZ =====
exports.deleteQuiz = async (req, res) => {
  try {
    await Quiz.findByIdAndDelete(req.params.id);
    await QuizAttempt.deleteMany({ quiz: req.params.id });
    res.json({ message: 'Quiz deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};