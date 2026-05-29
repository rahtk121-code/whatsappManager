import express from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { generateChatSummary } from "../services/aiService.js";

const router = express.Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    const where = { userId: req.user.id };
    if (status) where.status = status;

    const chats = await prisma.chat.findMany({
      where,
      include: {
        customer: true,
        messages: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
    });
    res.json(chats);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch chats", details: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { customerId } = req.body;
    if (!customerId) return res.status(400).json({ error: "customerId is required" });

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, userId: req.user.id },
    });
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const settings = await prisma.storeSetting.findUnique({ where: { userId: req.user.id } });

    const chat = await prisma.chat.create({
      data: {
        userId: req.user.id,
        customerId,
        status: "OPEN",
        autoReply: settings?.autoReply ?? true,
      },
      include: { customer: true, messages: true },
    });
    res.status(201).json(chat);
  } catch (error) {
    res.status(500).json({ error: "Failed to create chat", details: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const chat = await prisma.chat.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { customer: true, messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch chat", details: error.message });
  }
});

router.post("/:id/messages", async (req, res) => {
  try {
    const { sender, content } = req.body;
    if (!sender || !content) return res.status(400).json({ error: "sender and content are required" });

    const chat = await prisma.chat.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    const message = await prisma.message.create({
      data: { chatId: chat.id, sender, content },
    });
    await prisma.chat.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: "Failed to create message", details: error.message });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ["OPEN", "PENDING", "CLOSED"];
    if (!allowedStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

    const result = await prisma.chat.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { status },
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to update chat", details: error.message });
  }
});

// Toggle auto-reply for a chat
router.patch("/:id/auto-reply", async (req, res) => {
  try {
    const { autoReply } = req.body;
    const chat = await prisma.chat.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    const updated = await prisma.chat.update({
      where: { id: req.params.id },
      data: { autoReply: Boolean(autoReply) },
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Failed to update auto-reply", details: error.message });
  }
});

// Generate and store summary for a chat
router.post("/:id/summary", async (req, res) => {
  try {
    const chat = await prisma.chat.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    const summary = await generateChatSummary(chat.messages);
    if (summary) {
      await prisma.chat.update({ where: { id: chat.id }, data: { summary } });
    }
    res.json({ summary: summary || "لا يمكن إنشاء ملخص" });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate summary", details: error.message });
  }
});

// Send WhatsApp message proactively
router.post("/:id/send-whatsapp", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "message is required" });

    const chat = await prisma.chat.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { customer: true },
    });
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    // Dynamic import to avoid crash if WA not enabled
    const { sendMessageToPhone } = await import("../lib/whatsappManager.js");
    await sendMessageToPhone(req.user.id, chat.customer.phone, message);

    const saved = await prisma.message.create({
      data: { chatId: chat.id, sender: "agent", content: message },
    });
    await prisma.chat.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });

    res.json({ message: saved });
  } catch (error) {
    console.error("Send WhatsApp error:", error);
    res.status(500).json({ error: "Failed to send message", details: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const chat = await prisma.chat.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    await prisma.message.deleteMany({ where: { chatId: chat.id } });
    await prisma.chat.delete({ where: { id: chat.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete chat", details: error.message });
  }
});

export default router;
