const mongoose = require('mongoose');

const showcasePostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    videoUrl: { type: String, required: true },
    embedUrl: { type: String },
    thumbnail: { type: String },

    // Scope
    // Required for faculty/department posts. A featured post (super admin
    // posting to the main showcase) may have no faculty.
    faculty: {
      type: String,
      default: null,
      required: function () { return !this.isFeatured; },
    },
    department: { type: String, default: null }, // null = faculty-level post
    learningType: { type: String },

    // Tag
    tag: { type: String },

    // Who posted
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    postedByName: { type: String },
    postedByRole: { type: String },

    // Stats
    views: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
    isPinned: { type: Boolean, default: false },

    // Featured = shows in main showcase (admin only)
    isFeatured: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ShowcasePost', showcasePostSchema);