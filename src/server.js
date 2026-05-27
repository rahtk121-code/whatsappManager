import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";

import authRoutes from "./routes/auth.js";
import customersRoutes from "./routes/customers.js";
import productsRoutes from "./routes/products.js";
import ordersRoutes from "./routes/orders.js";
import chatsRoutes from "./routes/chats.js";
import aiRoutes from "./routes/ai.js";
import settingsRoutes from "./routes/settings.js";
import subscriptionRoutes from "./routes/subscription.js";
import whatsappRoutes from "./routes/whatsapp.js";

import { startAllReadyClients } from "./lib/whatsappManager.js";
import { initSocket } from "./lib/socket.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    credentials: true,
  },
});

initSocket(io);

app.use(helmet());

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: {
      error: "Too many requests",
    },
  })
);

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "WhatsApp Sales Agent Backend Running",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/customers", customersRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/chats", chatsRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/whatsapp", whatsappRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

app.use((err, req, res, next) => {
  console.error("Server Error:", err);

  res.status(500).json({
    error: "Internal Server Error",
  });
});

server.listen(PORT, async () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);

  if (process.env.ENABLE_WHATSAPP === "true") {
    try {
      await startAllReadyClients();
      console.log("✅ WhatsApp multi-session manager started");
    } catch (error) {
      console.error("❌ Failed to start WhatsApp sessions:", error.message);
    }
  } else {
    console.log("ℹ️ WhatsApp disabled. Set ENABLE_WHATSAPP=true to enable it.");
  }
});