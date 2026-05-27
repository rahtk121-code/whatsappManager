import express from "express";

import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

import {
  generateSmartReply,
} from "../services/aiService.js";

const router = express.Router();

router.use(authMiddleware);

async function ensureSubscription(userId) {
  let subscription =
    await prisma.subscription.findUnique({
      where: { userId },
    });

  if (!subscription) {
    subscription =
      await prisma.subscription.create({
        data: {
          userId,
          plan: "FREE",
          status: "ACTIVE",

          aiRepliesLimit: 20,
          customersLimit: 50,
          productsLimit: 20,
          ordersLimit: 30,
        },
      });
  }

  return subscription;
}

async function checkAIUsage(userId) {
  const subscription =
    await ensureSubscription(userId);

  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const usage =
    await prisma.usageLog.aggregate({
      where: {
        userId,
        type: "AI_REPLY",

        date: {
          gte: today,
        },
      },

      _sum: {
        count: true,
      },
    });

  const used =
    usage._sum.count || 0;

  return {
    allowed:
      used <
      subscription.aiRepliesLimit,

    used,

    limit:
      subscription.aiRepliesLimit,

    plan: subscription.plan,
  };
}

router.post(
  "/chat/:chatId/reply",
  async (req, res) => {
    try {
      const usage =
        await checkAIUsage(
          req.user.id
        );

      if (!usage.allowed) {
        return res
          .status(403)
          .json({
            error:
              "لقد وصلت إلى الحد اليومي لردود الذكاء الاصطناعي.",

            usage,
          });
      }

      const { chatId } =
        req.params;

      const chat =
        await prisma.chat.findFirst({
          where: {
            id: chatId,
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
        return res
          .status(404)
          .json({
            error:
              "Chat not found",
          });
      }

      const products =
        await prisma.product.findMany({
          where: {
            userId: req.user.id,
          },
        });

      const settings =
        await prisma.storeSetting.findUnique({
          where: {
            userId: req.user.id,
          },
        });

      const lastCustomerMessage =
        [...chat.messages]
          .reverse()
          .find(
            (m) =>
              m.sender ===
              "customer"
          )?.content || "";

      const reply =
        await generateSmartReply({
          text: lastCustomerMessage,

          messages:
            chat.messages,

          products,

          settings,
        });

      const savedMessage =
        await prisma.message.create({
          data: {
            chatId: chat.id,
            sender: "ai",
            content: reply,
          },
        });

      await prisma.chat.update({
        where: {
          id: chat.id,
        },

        data: {
          updatedAt:
            new Date(),
        },
      });

      await prisma.usageLog.create({
        data: {
          userId: req.user.id,
          type: "AI_REPLY",
          count: 1,
        },
      });

      res.json({
        reply,

        message:
          savedMessage,

        usage: {
          usedBeforeThisReply:
            usage.used,

          limit:
            usage.limit,

          plan:
            usage.plan,
        },
      });
    } catch (error) {
      console.error(
        "AI route error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to generate AI reply",

        details:
          error.message,
      });
    }
  }
);

export default router;