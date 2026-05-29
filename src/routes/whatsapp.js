import express from "express";

import { authMiddleware } from "../middleware/auth.js";

import {
  startClientForUser,
  stopClientForUser,
  getClientStatus,
  getQrCode,
} from "../lib/whatsappManager.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/status", async (req, res) => {
  try {
    const status = await getClientStatus(req.user.id);
    res.json(status);
  } catch (error) {
    console.error("WhatsApp status error:", error);

    res.status(500).json({
      error: "Failed to get WhatsApp status",
    });
  }
});

router.post("/start", async (req, res) => {
  try {
    await startClientForUser(req.user.id);

    const status = await getClientStatus(req.user.id);

    res.json({
      message: "WhatsApp client started",
      status,
    });
  } catch (error) {
    console.error("WhatsApp start error:", error);

    res.status(500).json({
      error: "Failed to start WhatsApp client",
      details: error.message,
    });
  }
});

router.post("/stop", async (req, res) => {
  try {
    const result = await stopClientForUser(req.user.id);

    res.json({
      message: "WhatsApp client stopped",
      ...result,
    });
  } catch (error) {
    console.error("WhatsApp stop error:", error);

    res.status(500).json({
      error: "Failed to stop WhatsApp client",
      details: error.message,
    });
  }
});

router.get("/qr", async (req, res) => {
  try {
    const qr = await getQrCode(req.user.id);

    res.json(qr);
  } catch (error) {
    console.error("WhatsApp QR error:", error);

    res.status(500).json({
      error: "Failed to get WhatsApp QR",
    });
  }
});

export default router;