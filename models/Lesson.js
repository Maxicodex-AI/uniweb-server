const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    weekNumber: { type: Number, required: true },
    title: { type: String, required: true },
    description: { type: String },
    objectives: [{ type: String }],

    // ===== GENERAL CONTENT =====
    aiSimplifiedContent: { type: String, default: null },
    aiDiagramDescription: { type: String, default: null },
    aiGeneratedAt: { type: Date, default: null },
    aiQualityScore: { type: Number, default: null },
    videoLinks: [{ title: String, url: String }],
    references: [{ type: String }],
    duration: { type: Number, default: 5 },

    // Legacy file fields (kept for backward compatibility)
    lectureNotes: { filename: String, url: String, size: String },
    pdfDocument: { filename: String, url: String, size: String },
    slides: { filename: String, url: String, size: String },
    images: [{ filename: String, url: String }],

    // ===== LANGUAGE & LINGUISTICS =====
    pronunciationExercises: [{
      word: String,
      language: String,
      phonetic: String,
      audioUrl: String,
      instructions: String,
    }],
    phoneticsExercises: [{
      symbol: String,
      example: String,
      description: String,
      practiceWords: [String],
    }],
    syntaxDrills: [{
      sentence: String,
      instruction: String,
      answer: String,
    }],
    languageVocab: [{
      word: String,
      translation: String,
      example: String,
      language: String,
    }],

    // ===== SCIENCE & MEDICINE =====
    caseStudies: [{
      title: String,
      description: String,
      questions: [String],
    }],
    labProcedures: [{
      step: Number,
      instruction: String,
      safetyNote: String,
    }],
    diagrams: [{
      title: String,
      imageUrl: String,
      description: String,
      labelPoints: [{ label: String, x: Number, y: Number }],
    }],

    // ===== ARTS & PERFORMANCE =====
    scriptContent: { type: String },
    performanceNotes: [{ type: String }],
    creativePrompts: [{ type: String }],

    // ===== AGRICULTURE =====
    fieldObservations: [{
      title: String,
      description: String,
      season: String,
      cropType: String,
    }],
    soilData: [{
      soilType: String,
      ph: String,
      nutrients: String,
      notes: String,
    }],

    // ===== ENGINEERING & TECHNOLOGY =====
    codeExercises: [{
      title: String,
      description: String,
      starterCode: String,
      language: String,
      expectedOutput: String,
      hints: [String],
    }],

    // ===== BUSINESS & ECONOMICS =====
    businessCases: [{
      company: String,
      situation: String,
      questions: [String],
      data: String,
    }],

    // ===== JOURNALISM & MEDIA =====
    articleDrafts: [{
      headline: String,
      brief: String,
      instructions: String,
    }],
    broadcastScripts: [{
      title: String,
      script: String,
      duration: String,
    }],

    // ===== DEPARTMENT TYPE =====
        departmentType: {
      type: String,
      enum: [
        'language_linguistics',
        'science_medicine',
        'arts_performance',
        'agriculture_environment',
        'engineering_technology',
        'business_economics',
        'journalism_media',
        'general_studies',
        'law_studies',
        'health_sciences',
        'education_studies',
      ],
      default: 'general_studies',
    },

    // ===== WORKFLOW =====
    status: {
      type: String,
      enum: ['draft', 'processing', 'pending_review', 'approved', 'published', 'rejected'],
      default: 'draft',
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewNotes: { type: String, default: null },
    publishedAt: { type: Date, default: null },
    scheduledFor: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lesson', lessonSchema);