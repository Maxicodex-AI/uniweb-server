const Notification = require('../models/Notification');
const User = require('../models/user');

// Send notification to specific user
async function notifyUser(userId, { type, title, message, link, data }) {
  try {
    await Notification.create({
      recipient: userId,
      type, title, message, link, data,
    });
  } catch (err) {
    console.error('Notification error:', err);
  }
}

// Send notification to multiple users
async function notifyMany(userIds, { type, title, message, link, data }) {
  try {
    const notifications = userIds.map(userId => ({
      recipient: userId,
      type, title, message, link, data,
    }));
    await Notification.insertMany(notifications);
  } catch (err) {
    console.error('Notification error:', err);
  }
}

// Notify all students in a faculty/department/level
async function notifyStudents({ faculty, department, level }, { type, title, message, link, data }) {
  try {
    const filter = { role: 'student', faculty };
    if (department) filter.department = department;
    if (level) filter.level = level;
    const students = await User.find(filter).select('_id');
    const ids = students.map(s => s._id);
    if (ids.length > 0) await notifyMany(ids, { type, title, message, link, data });
  } catch (err) {
    console.error('Notification error:', err);
  }
}

// Notify all lecturers in a faculty
async function notifyLecturers(faculty, { type, title, message, link, data }) {
  try {
    const lecturers = await User.find({
      role: { $in: ['lecturer', 'faculty_admin', 'department_admin'] },
      faculty,
    }).select('_id');
    const ids = lecturers.map(l => l._id);
    if (ids.length > 0) await notifyMany(ids, { type, title, message, link, data });
  } catch (err) {
    console.error('Notification error:', err);
  }
}

module.exports = { notifyUser, notifyMany, notifyStudents, notifyLecturers };