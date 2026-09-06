const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const PersonalEvent = require('../models/PersonalEvent');

// Get all my events
router.get('/', auth, async (req, res) => {
  try {
    const events = await PersonalEvent.find({ user: req.user._id })
      .sort({ date: 1, startTime: 1 });
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create event
router.post('/', auth, async (req, res) => {
  try {
    const event = await PersonalEvent.create({
      ...req.body,
      user: req.user._id,
    });
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update event
router.put('/:id', auth, async (req, res) => {
  try {
    const event = await PersonalEvent.findOne({ _id: req.params.id, user: req.user._id });
    if (!event) return res.status(404).json({ message: 'Event not found' });
    const updated = await PersonalEvent.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete event
router.delete('/:id', auth, async (req, res) => {
  try {
    await PersonalEvent.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark complete
router.put('/:id/complete', auth, async (req, res) => {
  try {
    const event = await PersonalEvent.findByIdAndUpdate(
      req.params.id,
      { isCompleted: true },
      { new: true }
    );
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;