const Room = require('../models/Room');

// ===== GLOBAL ROOM (everyone reads, admin posts) =====
async function ensureGlobalRoom() {
  const exists = await Room.findOne({ name: 'global' });
  if (exists) return exists;
  return Room.create({
    name: 'global',
    type: 'global',
  });
}

// ===== ALL LECTURERS ROOM (every lecturer in university) =====
async function ensureLecturersGlobalRoom() {
  const exists = await Room.findOne({ name: 'lecturers_global' });
  if (exists) return exists;
  return Room.create({
    name: 'lecturers_global',
    type: 'lecturer',
    subType: 'all',
  });
}

// ===== FACULTY LECTURER ROOM =====
async function ensureLecturerRoom(faculty) {
  const roomName = `${faculty}_lecturer`;
  const exists = await Room.findOne({ name: roomName });
  if (exists) return exists;
  return Room.create({
    name: roomName,
    type: 'lecturer',
    subType: 'faculty',
    faculty,
  });
}

// ===== DEPARTMENT LECTURER ROOM =====
async function ensureDepartmentLecturerRoom(faculty, department) {
  const roomName = `${faculty}_${department}_lecturer`;
  const exists = await Room.findOne({ name: roomName });
  if (exists) return exists;
  return Room.create({
    name: roomName,
    type: 'lecturer',
    subType: 'department',
    faculty,
    department,
  });
}

// ===== STUDENT ROOMS (general + resources per level) =====
async function ensureStudentRooms(faculty, department, level) {
  const generalName = `${faculty}_${department}_${level}_general`;
  const resourcesName = `${faculty}_${department}_${level}_resources`;

  const generalExists = await Room.findOne({ name: generalName });
  const resourcesExists = await Room.findOne({ name: resourcesName });

  const general = generalExists || await Room.create({
    name: generalName,
    type: 'student',
    subType: 'general',
    faculty,
    department,
    level,
  });

  const resources = resourcesExists || await Room.create({
    name: resourcesName,
    type: 'student',
    subType: 'resources',
    faculty,
    department,
    level,
  });

  return { general, resources };
}

module.exports = {
  ensureGlobalRoom,
  ensureLecturersGlobalRoom,
  ensureLecturerRoom,
  ensureDepartmentLecturerRoom,
  ensureStudentRooms,
};