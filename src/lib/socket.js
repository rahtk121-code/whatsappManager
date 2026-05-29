let ioInstance = null;

export function initSocket(io) {
  ioInstance = io;

  io.on("connection", (socket) => {
    console.log("🔌 Socket connected:", socket.id);

    socket.on("join-user-room", (userId) => {
      if (!userId) return;

      socket.join(`user:${userId}`);

      console.log(`✅ Socket ${socket.id} joined user:${userId}`);
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected:", socket.id);
    });
  });
}

export function emitToUser(userId, event, payload) {
  if (!ioInstance) return;

  ioInstance.to(`user:${userId}`).emit(event, payload);
}