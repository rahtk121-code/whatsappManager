import express from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

router.use(authMiddleware);

// جلب محادثات المستخدم
router.get("/", async (req, res) => {
  try {
    const chats = await prisma.chat.findMany({
      where: {
        userId: req.user.id,
      },
      include: {
        customer: true,
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    res.json(chats);
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch chats",
      details: error.message,
    });
  }
});

// إنشاء محادثة
router.post("/", async (req, res) => {
  try {
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({
        error: "customerId is required",
      });
    }

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        userId: req.user.id,
      },
    });

    if (!customer) {
      return res.status(404).json({
        error: "Customer not found",
      });
    }

    const chat = await prisma.chat.create({
      data: {
        userId: req.user.id,
        customerId,
        status: "OPEN",
      },
      include: {
        customer: true,
        messages: true,
      },
    });

    res.status(201).json(chat);
  } catch (error) {
    res.status(500).json({
      error: "Failed to create chat",
      details: error.message,
    });
  }
});

// جلب محادثة واحدة
router.get("/:id", async (req, res) => {
  try {
    const chat = await prisma.chat.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
      include: {
        customer: true,
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!chat) {
      return res.status(404).json({
        error: "Chat not found",
      });
    }

    res.json(chat);
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch chat",
      details: error.message,
    });
  }
});

// إضافة رسالة
router.post("/:id/messages", async (req, res) => {
  try {
    const { sender, content } = req.body;

    if (!sender || !content) {
      return res.status(400).json({
        error: "sender and content are required",
      });
    }

    const chat = await prisma.chat.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!chat) {
      return res.status(404).json({
        error: "Chat not found",
      });
    }

    const message = await prisma.message.create({
      data: {
        chatId: chat.id,
        sender,
        content,
      },
    });

    await prisma.chat.update({
      where: {
        id: chat.id,
      },
      data: {
        updatedAt: new Date(),
      },
    });

    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({
      error: "Failed to create message",
      details: error.message,
    });
  }
});

// تغيير حالة المحادثة
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;

    const allowedStatuses = ["OPEN", "PENDING", "CLOSED"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid status",
      });
    }

    const result = await prisma.chat.updateMany({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
      data: {
        status,
      },
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: "Failed to update chat",
      details: error.message,
    });
  }
});

// حذف محادثة
router.delete("/:id", async (req, res) => {
  try {
    const chat = await prisma.chat.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!chat) {
      return res.status(404).json({
        error: "Chat not found",
      });
    }

    await prisma.message.deleteMany({
      where: {
        chatId: chat.id,
      },
    });

    await prisma.chat.delete({
      where: {
        id: chat.id,
      },
    });

    res.json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to delete chat",
      details: error.message,
    });
  }
});

export default router;