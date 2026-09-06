const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    faculty: { type: String, required: true },
    maxLevel: { type: Number, default: 400 },
    description: { type: String },
        learningType: {
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
    keySkills: [{ type: String }],
    departmentAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isActive: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

departmentSchema.index({ name: 1, faculty: 1 }, { unique: true });

module.exports = mongoose.model('Department', departmentSchema);