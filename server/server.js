const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const passport = require("passport");
require("dotenv").config();
const Message = require("./models/Message");
const Channel = require("./models/Channel");
const User= require("./models/User");
console.log("Secret Key:", process.env.SECRET_OR_KEY);
console.log("Secret Key:", process.env.MONGODB_URI);


const app = express();
const httpServer = require("http").createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(passport.initialize());

// Passport config
require("./config/passport")(passport);

// DB Config
const connectDB = require("./config/db");

// Connect to MongoDB
connectDB();

// Routes
const usersRouter = require("./routes/users");
const boardsRouter = require("./routes/boards");
const membersRouter = require("./routes/members");
const messagesRouter = require("./routes/messages");
const channelRouter = require("./routes/channels");
app.use("/api/", usersRouter);
app.use("/api/", boardsRouter);
app.use("/api/", membersRouter);
app.use("/api/", messagesRouter);
app.use("/api/", channelRouter);

const PORT = process.env.PORT || 5000;

app.get("/test", (req, res) => {
  res.json({ message: "Server is connected test" });
});

const io = require("socket.io")(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allowedHeaders: ["Authorization"],
    credentials: true,
  },
  pingTimeout: 60 * 1000,
});

const wrapMiddlewareForSocketIo = (middleware) => (socket, next) =>
  middleware(socket.request, socket.request.res, next);
io.use(wrapMiddlewareForSocketIo(passport.initialize()));

io.use((socket, next) => {
  passport.authenticate("jwt", { session: false }, (err, user) => {
    if (err || !user) {
      return next(new Error("Authentication error: Invalid token"));
    }
    socket.user = user;
    return next();
  })(socket.handshake, {}, next);
});

io.on("connection", (socket) => {
  console.log(`User connected ${socket.user._id}`);
  socket.on("setup", (message) => {
    socket.emit("connected");
  });

  socket.on("joinChannel", (channelId) => {
    socket.join(channelId);
    console.log(`User joined channel ${channelId}`);
  });

  socket.on("joinBoard", (boardId) => {
    socket.join(boardId);
    console.log(`User joined board ${boardId}`);
  });

  socket.on(
    "newMessage",
    async ({ channelId, content, timestamp, creator }) => {
      try {
        // Create and save the new message
        const newMessage = await new Message({
          content,
          creator,
          channel: channelId,
          timestamp: timestamp || Date.now(), // Use provided timestamp or current time
        }).save();

        // Update the channel's message list
        await Channel.findByIdAndUpdate(channelId, {
          $push: { messages: newMessage._id },
        });

        // Populate the creator field
        const populatedMessage = await Message.findById(
          newMessage._id
        ).populate("creator", "firstName lastName");

        // Emit the message to the channel
        io.to(channelId).emit("newMessage", populatedMessage);
      } catch (error) {
        console.error(error);
      }
    }
  );


  socket.on("newChannel", async (channelId) => { 
    const newChannel = await Channel.findById(channelId);
    console.log(newChannel);
    io.to(newChannel.board).emit("newChannel", newChannel);
  });

  socket.on("deleteChannel", async ({ channelToDelete, boardId }) => {
    
    console.log("Delete id " + channelToDelete);
    io.to(boardId).emit("deleteChannel", channelToDelete);
  });

  socket.on("leaveChannel", (channelId) => {
    socket.leave(channelId);
    console.log(`User left channel ${channelId}`);
  });

  socket.on("leaveBoard", (boardId) => {
    socket.leave(boardId);
    console.log(`User left board ${boardId}`);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
