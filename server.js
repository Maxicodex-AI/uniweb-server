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
// FIXED: previously, socket identity (role/faculty/department) came straight from
// whatever the client sent in the "userOnline" event, with nothing verifying it —
// meaning any raw socket client could claim role: "admin" and get joined into
// role-gated rooms in joinRoom below. This middleware runs before any connection
// is accepted, verifies the same JWT your REST API already issues, and looks the
// user up in the DB so role/faculty/department are trustworthy from that point on.
//
// Matches middleware/auth.js exactly: jwt.verify(token, process.env.JWT_SECRET)
// and decoded.id as the user's _id.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('name role faculty department level');
    if (!user) return next(new Error('User not found'));

    socket.userData = {
      id: user._id,
      name: user.name,
      role: user.role,
      faculty: user.faculty,
      department: user.department,
      level: user.level,
    };

    next();
  } catch (err) {
    next(new Error('Authentication failed'));
  }
});


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
    // FIXED: identity now comes from the verified socket.userData set during the
    // io.use() auth handshake above, not from a client-supplied payload — a raw
    // socket client can no longer announce itself as any name/role it wants.
    const user = socket.userData;
    if (!user) return;

    onlineUsers.push({
      id: socket.id,
      name: user.name,
      role: user.role,
    });

    io.emit("onlineUsers", onlineUsers);
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

  socket.on("disconnect", () => {

    onlineUsers = onlineUsers.filter(
      u => u.id !== socket.id
    );

    io.emit("onlineUsers", onlineUsers);

    console.log("🔴 Disconnected:", socket.id);

  });

});


// ================= START =================

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});