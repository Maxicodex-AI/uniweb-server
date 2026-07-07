// server.js

// ================= IMPORTS =================

const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cors = require('cors');

const http = require('http');
const { Server } = require('socket.io');


// ================= CONFIG =================

dotenv.config();

const app = express();

app.use(cors());
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

// rooms
const roomRoutes = require('./routes/roomRoutes');
app.use('/api/rooms', roomRoutes);


// ================= DEFAULT =================

app.get('/', (req, res) => {
  res.send('✅ UniLearn Server is running...');
});


// ================= MONGODB =================

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((err) => console.log('❌ MongoDB connection error:', err));


// ================= SERVER + SOCKET =================

const PORT = process.env.PORT || 5001;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.set("io", io);


// ================= ONLINE USERS =================

let onlineUsers = [];


// ================= SOCKET =================

io.on("connection", (socket) => {

  console.log("🟢 Connected:", socket.id);


// ================= JOIN ROOM =================

  socket.on("joinRoom", (room) => {

    const user = socket.userData;

    // If we don't know who this socket belongs to yet, refuse
    if (!user) {
      console.log("Blocked joinRoom: no user identity on socket");
      return;
    }

    // Admins can join any room
    if (user.role === "admin") {
      socket.join(room);
      console.log("Joined room:", room);
      return;
    }

    // Global room — everyone can join (read only enforced on backend)
    if (room === "global") {
      socket.join(room);
      console.log("Joined room:", room);
      return;
    }

    // Lecturers
    if (user.role === "lecturer") {
      const allowedRooms = [
        "lecturers_global",
        `${user.faculty}_lecturer`,
        `${user.faculty}_${user.department}_lecturer`,
      ];
      // Also allow resources rooms in their faculty+department
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


// ================= USER ONLINE =================

  socket.on("userOnline", (user) => {

    // Save the user's identity directly on this socket connection
    // so we can verify room access later (e.g. in joinRoom)
    socket.userData = {
      name: user.name,
      role: user.role,
      faculty: user.faculty,
      department: user.department,
      level: user.level,
    };

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