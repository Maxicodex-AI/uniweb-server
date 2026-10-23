const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const ShowcasePost = require('../models/ShowcasePost');

// ===== Helpers =====
function getEmbedUrl(url) {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&loop=1&playlist=${ytMatch[1]}&controls=0&showinfo=0&rel=0`;
  const ytShort = url.match(/youtube\.com\/shorts\/([^&\n?#]+)/);
  if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}?autoplay=1&mute=1&loop=1&playlist=${ytShort[1]}&controls=0`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1&muted=1&loop=1&background=1`;
  return url;
}

function getThumbnail(url) {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  if (ytMatch) return `https://img.youtube.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
  const ytShort = url.match(/youtube\.com\/shorts\/([^&\n?#]+)/);
  if (ytShort) return `https://img.youtube.com/vi/${ytShort[1]}/maxresdefault.jpg`;
  return null;
}

// ===== GET ALL FEATURED (public — for main showcase) =====
router.get('/', async (req, res) => {
  try {
    const { faculty, tag } = req.query;
    let filter = { isPublished: true, isFeatured: true };
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

// ===== GET ALL FACULTIES WITH POST COUNTS (public) =====
router.get('/faculties', async (req, res) => {
  try {
    const Faculty = require('../models/Faculty');
    const faculties = await Faculty.find({ isActive: true }).sort({ name: 1 });

    const facultiesWithCounts = await Promise.all(
      faculties.map(async (faculty) => {
        const postCount = await ShowcasePost.countDocuments({
          faculty: faculty.name,
          isPublished: true,
        });

        const Department = require('../models/Department');
        const departments = await Department.find({ faculty: faculty.name });

        const deptsWithCounts = await Promise.all(
          departments.map(async (dept) => {
            const deptPostCount = await ShowcasePost.countDocuments({
              faculty: faculty.name,
              department: dept.name,
              isPublished: true,
            });
            const latestPost = await ShowcasePost.findOne({
              faculty: faculty.name,
              department: dept.name,
              isPublished: true,
            }).sort({ createdAt: -1 });
            return {
              _id: dept._id,
              name: dept.name,
              description: dept.description,
              learningType: dept.learningType,
              postCount: deptPostCount,
              latestThumbnail: latestPost?.thumbnail || null,
            };
          })
        );

        return {
          _id: faculty._id,
          name: faculty.name,
          description: faculty.description,
          postCount,
          departments: deptsWithCounts,
        };
      })
    );

    res.json(facultiesWithCounts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== GET POSTS BY FACULTY (public) =====
router.get('/faculty/:facultyName', async (req, res) => {
  try {
    const posts = await ShowcasePost.find({
      faculty: decodeURIComponent(req.params.facultyName),
      isPublished: true,
    }).sort({ createdAt: -1 }).limit(20);
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== GET POSTS BY DEPARTMENT (public) =====
router.get('/department/:facultyName/:deptName', async (req, res) => {
  try {
    const posts = await ShowcasePost.find({
      faculty: decodeURIComponent(req.params.facultyName),
      department: decodeURIComponent(req.params.deptName),
      isPublished: true,
    }).sort({ createdAt: -1 });

    // Increment views
    await ShowcasePost.updateMany({
      faculty: decodeURIComponent(req.params.facultyName),
      department: decodeURIComponent(req.params.deptName),
    }, { $inc: { views: 1 } });

    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== GET SINGLE POST (public) =====
router.get('/:id', async (req, res) => {
  try {
    const post = await ShowcasePost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    post.views += 1;
    await post.save();
    res.json(post);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== CREATE POST =====
router.post('/', auth, authorizeRole('admin', 'faculty_admin', 'department_admin'), async (req, res) => {
  try {
    const { title, description, videoUrl, faculty, department, tag, isFeatured } = req.body;
    const user = req.user;

    // Scope check
    if (user.role === 'faculty_admin' && faculty !== user.faculty) {
      return res.status(403).json({ message: 'You can only post to your own faculty' });
    }
    if (user.role === 'department_admin') {
      if (faculty !== user.faculty || department !== user.department) {
        return res.status(403).json({ message: 'You can only post to your own department' });
      }
    }

    const embedUrl = getEmbedUrl(videoUrl);
    const thumbnail = getThumbnail(videoUrl);

    const post = await ShowcasePost.create({
      title, description, videoUrl, embedUrl, thumbnail,
      faculty: faculty || user.faculty,
      department: department || (user.role === 'department_admin' ? user.department : null),
      learningType: req.body.learningType || null,
      tag,
      postedBy: user._id,
      postedByName: user.name,
      postedByRole: user.role,
      isPublished: true,
      isFeatured: user.role === 'admin' ? (isFeatured || false) : false,
    });

    res.status(201).json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== DELETE =====
router.delete('/:id', auth, authorizeRole('admin', 'faculty_admin', 'department_admin'), async (req, res) => {
  try {
    const post = await ShowcasePost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    // Scope check
    if (req.user.role === 'faculty_admin' && post.faculty !== req.user.faculty) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (req.user.role === 'department_admin' && post.department !== req.user.department) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await ShowcasePost.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== PIN/UNPIN (admin only) =====
router.put('/:id/pin', auth, authorizeRole('admin'), async (req, res) => {
  try {
    const post = await ShowcasePost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Not found' });
    post.isPinned = !post.isPinned;
    await post.save();
    res.json(post);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== FEATURE/UNFEATURE (admin only) =====
router.put('/:id/feature', auth, authorizeRole('admin'), async (req, res) => {
  try {
    const post = await ShowcasePost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Not found' });
    post.isFeatured = !post.isFeatured;
    await post.save();
    res.json(post);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;