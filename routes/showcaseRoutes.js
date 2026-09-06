const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const ShowcasePost = require('../models/ShowcasePost');

// ===== Helper: extract YouTube embed URL =====
function getEmbedUrl(url) {
  // YouTube watch URL
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  if (ytMatch) {
    return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&loop=1&playlist=${ytMatch[1]}&controls=0&showinfo=0&rel=0`;
  }
  // YouTube short URL
  const ytShort = url.match(/youtube\.com\/shorts\/([^&\n?#]+)/);
  if (ytShort) {
    return `https://www.youtube.com/embed/${ytShort[1]}?autoplay=1&mute=1&loop=1&playlist=${ytShort[1]}&controls=0`;
  }
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1&muted=1&loop=1&background=1`;
  }
  // Return as-is for direct MP4 — NOTE: the frontend currently puts this straight into an
  // <iframe src>, which does not render a proper inline player for raw video files. If you
  // start posting direct MP4 links, the ShowcaseSection component needs a <video> fallback
  // for posts whose embedUrl isn't a youtube.com/vimeo.com URL.
  return url;
}

// ===== Helper: extract YouTube thumbnail =====
function getThumbnail(url) {
  // hqdefault is generated for virtually every YouTube video; maxresdefault is not
  // (older/low-res uploads often lack it and 404).
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  if (ytMatch) {
    return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
  }
  const ytShort = url.match(/youtube\.com\/shorts\/([^&\n?#]+)/);
  if (ytShort) {
    return `https://img.youtube.com/vi/${ytShort[1]}/hqdefault.jpg`;
  }
  return null;
}

// ===== GET ALL (public — no auth needed) =====
router.get('/', async (req, res) => {
  try {
    const { faculty, tag } = req.query;
    let filter = { isPublished: true };
    if (faculty) filter.faculty = faculty;
    if (tag) filter.tag = tag;

    const posts = await ShowcasePost.find(filter)
      .sort({ isPinned: -1, createdAt: -1 })
      .limit(20);

    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== GET SINGLE (public) =====
// NOTE: this is the only route that increments `views`. The frontend showcase grid
// currently never calls this endpoint (it only fetches the list), so view counts
// will stay frozen unless/until the frontend fires a request here when a card is
// actually opened/played.
router.get('/:id', async (req, res) => {
  try {
    const post = await ShowcasePost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    // Increment views
    post.views += 1;
    await post.save();

    res.json(post);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== CREATE (admin, faculty_admin, department_admin) =====
router.post('/', auth, authorizeRole('admin', 'faculty_admin', 'department_admin'), async (req, res) => {
  try {
    const { title, description, videoUrl, faculty, department, tag } = req.body;

    const embedUrl = getEmbedUrl(videoUrl);
    const thumbnail = getThumbnail(videoUrl);

    const post = await ShowcasePost.create({
      title,
      description,
      videoUrl,
      embedUrl,
      thumbnail,
      faculty,
      department,
      tag,
      postedBy: req.user._id,
      postedByName: req.user.name,
      isPublished: true,
    });

    res.status(201).json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== UPDATE (admin, faculty_admin, department_admin) =====
router.put('/:id', auth, authorizeRole('admin', 'faculty_admin', 'department_admin'), async (req, res) => {
  try {
    const post = await ShowcasePost.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!post) return res.status(404).json({ message: 'Post not found' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== DELETE (admin only) =====
// Tightened to match the comment/UI: your AdminPage's Showcase tab (the only place
// delete is currently exposed) is gated to role === 'admin', so faculty_admin never
// used this in practice. If you want faculty_admin to delete their own posts too,
// add it back explicitly rather than leaving it implicit.
router.delete('/:id', auth, authorizeRole('admin'), async (req, res) => {
  try {
    await ShowcasePost.findByIdAndDelete(req.params.id);
    res.json({ message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== PIN/UNPIN (admin only) =====
router.put('/:id/pin', auth, authorizeRole('admin'), async (req, res) => {
  try {
    const post = await ShowcasePost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    post.isPinned = !post.isPinned;
    await post.save();
    res.json(post);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;