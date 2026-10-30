// server.js

// ================= IMPORTS =================

const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const http = require('http');
const { Server } = require('socket.io');

const auth = require('./middleware/auth');
const authorizeRole = require('./middleware/authorizeRole');
const User = require('./models/user');
const Driver = require('./models/Driver'); // NOTE: filename case must match exactly on Linux hosts
const { cleanupDeletedMessages } = require('./utils/cleanupHelper');


// ================= CONFIG =================

dotenv.config();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());


// ================= ROUTES =================

// users
const userRoutes = require('./routes/userRoutes');
app.use('/api/users', userRoutes);

// test
const testRoutes = require('./routes/testRoutes');
app.use('/api/test', testRoutes);

// announcements
const announcementRoutes = require('./routes/announcementRoutes');
app.use('/api/announcements', announcementRoutes);

// chat
const chatRoutes = require('./routes/chatRoutes');
app.use('/api/chat', chatRoutes);

// live
const liveRoutes = require('./routes/liveRoutes');
app.use('/api/live', liveRoutes);

// academic
const academicRoutes = require('./routes/academicRoutes');
app.use('/api/academic', academicRoutes);

// departments
const departmentRoutes = require('./routes/departmentRoutes');
app.use('/api/departments', departmentRoutes);

// faculty
const facultyRoutes = require('./routes/facultyRoutes');
app.use('/api/faculties', facultyRoutes);

// rooms
const roomRoutes = require('./routes/roomRoutes');
app.use('/api/rooms', roomRoutes);

// courses
const courseRoutes = require('./routes/courseRoutes');
app.use('/api/courses', courseRoutes);

// lessons
const lessonRoutes = require('./routes/lessonRoutes');
app.use('/api/lessons', lessonRoutes);

const codeRoutes = require('./routes/codeRoutes');
app.use('/api/code', codeRoutes);

// quiz
const quizRoutes = require('./routes/quizRoutes');
app.use('/api/quiz', quizRoutes);

// timetable
const timetableRoutes = require('./routes/timetableRoutes');
app.use('/api/timetable', timetableRoutes);

// personal events
const personalEventRoutes = require('./routes/personalEventRoutes');
app.use('/api/personal-events', personalEventRoutes);

// notifications
const notificationRoutes = require('./routes/notificationRoutes');
app.use('/api/notifications', notificationRoutes);

// showcase
const showcaseRoutes = require('./routes/showcaseRoutes');
app.use('/api/showcase', showcaseRoutes);

// drivers
const driverRoutes = require('./routes/driverRoutes');
app.use('/api/drivers', driverRoutes);

const aiRoutes = require('./routes/aiRoutes');
app.use('/api/ai', aiRoutes);

// ================= DEFAULT =================

app.get('/', (req, res) => {
  res.send('✅ UniLearn Server is running...');
});

// TEMPORARY SEED ROUTE — DELETE AFTER USE
app.get('/api/seed-admin', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const User = require('./models/user');

    const existing = await User.findOne({ email: 'admin@uniweb.com' });
    if (existing) return res.json({ message: 'Admin already exists', email: 'admin@uniweb.com' });

    const salt = await bcrypt.genSalt(10);
    const password = await bcrypt.hash('Admin@2024', salt);

    const admin = await User.create({
      name: 'Super Admin',
      email: 'admin@uniweb.com',
      password,
      role: 'admin',
      faculty: 'Administration',
      department: 'Administration',
      avatarColor: '#dc2626',
    });

    res.json({ message: 'Admin created!', email: 'admin@uniweb.com', password: 'Admin@2024' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ================= MONGODB =================

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((err) => console.log('❌ MongoDB connection error:', err));

// Run message cleanup every hour
setInterval(cleanupDeletedMessages, 60 * 60 * 1000);


// ================= SERVER + SOCKET =================

const PORT = process.env.PORT || 5001;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.set("io", io);


// ================= SOCKET AUTH =================
// Verifies the JWT sent in socket.handshake.auth.token before any connection
// is accepted, then looks the identity up in the DB so role/faculty/department
// are trustworthy. Supports both regular users (User collection) and
// shuttle drivers (Driver collection).
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Regular user first
    const user = await User.findById(decoded.id).select('name role faculty department level');
    if (user) {
      socket.userData = {
        id: user._id,
        name: user.name,
        role: user.role,
        faculty: user.faculty,
        department: user.department,
        level: user.level,
      };
      return next();
    }

    // Otherwise, a driver
    const driver = await Driver.findById(decoded.id).select('name');
    if (driver) {
      socket.userData = {
        id: driver._id,
        name: driver.name,
        role: 'driver',
      };
      return next();
    }

    return next(new Error('User not found'));
  } catch (err) {
    next(new Error('Authentication failed'));
  }
});


// ================= HELPERS =================

// Marks a driver offline and tells all clients. Safe to call more than once.
async function setDriverOffline(driverId) {
  try {
    await Driver.findByIdAndUpdate(driverId, {
      isOnShift: false,
      status: 'offline',
    });
    io.emit('driverOffline', { driverId: String(driverId) });
  } catch (err) {
    console.error('Driver offline error:', err.message);
  }
}


// ================= ONLINE USERS =================

let onlineUsers = [];


// ================= SOCKET =================

io.on("connection", (socket) => {

  console.log("🟢 Connected:", socket.id, "as", socket.userData?.name);


// ================= JOIN ROOM =================

  socket.on("joinRoom", (room) => {

    const user = socket.userData;

    if (!user) {
      console.log("Blocked joinRoom: no user identity on socket");
      return;
    }

    // Super admin — global, bulletin, resources only
    if (user.role === "admin") {
      const isAllowed =
        room === "global" ||
        room.endsWith("_bulletin") ||
        room.endsWith("_resources");
      if (isAllowed) {
        socket.join(room);
        console.log("Joined room:", room);
      } else {
        console.log("Blocked joinRoom: admin tried to join private room", room);
      }
      return;
    }

    // Global room — everyone can join
    if (room === "global") {
      socket.join(room);
      console.log("Joined room:", room);
      return;
    }

    // Faculty bulletin — lecturers, faculty_admin, students of same faculty
    if (room.endsWith("_bulletin")) {
      const faculty = room.replace("_bulletin", "");
      if (user.faculty === faculty) {
        socket.join(room);
        console.log("Joined room:", room);
      } else {
        console.log("Blocked joinRoom: wrong faculty for bulletin", room);
      }
      return;
    }

    // Department admin — lecturer rooms + resources in their department
    if (user.role === "department_admin") {
      const allowedRooms = [
        "lecturers_global",
        `${user.faculty}_lecturer`,
        `${user.faculty}_${user.department}_lecturer`,
      ];
      const isResourcesRoom =
        room.startsWith(`${user.faculty}_${user.department}`) &&
        room.endsWith("_resources");

      if (allowedRooms.includes(room) || isResourcesRoom) {
        socket.join(room);
        console.log("Joined room:", room);
      } else {
        console.log("Blocked joinRoom: department_admin tried to join", room);
      }
      return;
    }

    // Lecturers
    if (user.role === "lecturer") {
      const allowedRooms = [
        "lecturers_global",
        `${user.faculty}_lecturer`,
        `${user.faculty}_${user.department}_lecturer`,
      ];
      const isResourcesRoom =
        room.startsWith(`${user.faculty}_${user.department}`) &&
        room.endsWith("_resources");

      if (allowedRooms.includes(room) || isResourcesRoom) {
        socket.join(room);
        console.log("Joined room:", room);
      } else {
        console.log("Blocked joinRoom: lecturer tried to join", room);
      }
      return;
    }

    // Students
    if (user.role === "student") {
      const allowedGeneral =
        `${user.faculty}_${user.department}_${user.level}_general`;
      const allowedResources =
        `${user.faculty}_${user.department}_${user.level}_resources`;

      if (room === allowedGeneral || room === allowedResources) {
        socket.join(room);
        console.log("Joined room:", room);
      } else {
        console.log("Blocked joinRoom: student tried to join", room);
      }
      return;
    }

  });

  // ================= LEAVE ROOM =================

  socket.on("leaveRoom", (room) => {
    socket.leave(room);
    console.log("Left room:", room);
  });


// ================= USER ONLINE =================

  socket.on("userOnline", () => {
    const user = socket.userData;
    if (!user) return;

    onlineUsers.push({
      id: socket.id,
      name: user.name,
      role: user.role,
    });

    io.emit("onlineUsers", onlineUsers);
  });


  // ================= DRIVER LOCATION TRACKING =================
  // Identity comes from the verified socket.userData (set in io.use above),
  // so the client cannot update another driver's record by sending a
  // different driverId. Any driverId/token fields sent by the client are ignored.

  socket.on('driverLocation', async (data) => {
    try {
      const user = socket.userData;
      if (!user || user.role !== 'driver') return;

      const { lat, lng, availableSeats, status } = data || {};

      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      if (availableSeats !== undefined && typeof availableSeats !== 'number') return;

      const driverId = String(user.id);
      const updatedAt = new Date();

      const update = {
        currentLocation: { lat, lng, updatedAt },
        isOnShift: true,
      };
      if (availableSeats !== undefined) update.availableSeats = availableSeats;
      if (status) update.status = status;

      await Driver.findByIdAndUpdate(driverId, update);

      // Broadcast to all connected clients (students)
      io.emit('driverLocationUpdate', {
        driverId,
        lat,
        lng,
        availableSeats,
        status,
        updatedAt,
      });
    } catch (err) {
      console.error('Driver location error:', err.message);
    }
  });

  // Driver ends shift manually
  socket.on('driverDisconnect', async () => {
    const user = socket.userData;
    if (!user || user.role !== 'driver') return;
    await setDriverOffline(user.id);
  });


  // ================= WEBRTC OFFER =================

  socket.on("webrtc-offer", ({ offer, room }) => {

    socket.to(room).emit("webrtc-offer", {
      offer,
    });

  });


  // ================= WEBRTC ANSWER =================

  socket.on("webrtc-answer", ({ answer, room }) => {

    socket.to(room).emit("webrtc-answer", {
      answer,
    });

  });


  // ================= WEBRTC ICE =================

  socket.on("webrtc-candidate", ({ candidate, room }) => {

    socket.to(room).emit("webrtc-candidate", {
      candidate,
    });

  });

  // ================= JOIN LIVE ROOM =================

  socket.on("joinLiveRoom", ({ room, liveId, token }) => {
    // Anyone joining a live room gets added to it
    // Access control was already verified by joinLive REST endpoint
    socket.join(room);
    console.log("📡 Joined live room:", room);
  });

  // ================= LIVE ROOM JOINED (notify others) =================

  socket.on("liveRoomJoined", ({ room, user }) => {
    // Tell everyone else in the room that someone joined
    // This triggers the lecturer to send an offer to the new student
    socket.to(room).emit("studentJoined", { user });
    console.log("👤 User joined live room:", user?.name);
  });


  // ================= DISCONNECT =================

  socket.on("disconnect", async () => {

    onlineUsers = onlineUsers.filter(
      u => u.id !== socket.id
    );

    io.emit("onlineUsers", onlineUsers);

    // If a driver's connection drops, take them off shift
    if (socket.userData?.role === 'driver') {
      await setDriverOffline(socket.userData.id);
    }

    console.log("🔴 Disconnected:", socket.id);

  });

});


// ================= START =================

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});