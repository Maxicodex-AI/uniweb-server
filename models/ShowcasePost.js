const mongoose = require('mongoose');

const showcasePostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    // YouTube/Vimeo/direct video URL
    videoUrl: { type: String, required: true },
    // YouTube embed URL (auto-generated)
    embedUrl: { type: String },
    // Thumbnail image URL
    thumbnail: { type: String },
    // Department/faculty info
    faculty: { type: String },
    department: { type: String },
    // Tag e.g. "Theatre Arts", "Crop Science", "Sports"
    tag: { type: String },
    // Who posted it
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    postedByName: { type: String },
    // View count
    views: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
    isPinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ShowcasePost', showcasePostSchema);