import express from "express";

import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

router.use(authMiddleware);

// =======================
// GET CURRENT SUBSCRIPTION
// =======================

router.get("/", async (req, res) => {
  try {
    let subscription =
      await prisma.subscription.findUnique({
        where: {
          userId: req.user.id,
        },
      });

    // إنشاء اشتراك مجاني تلقائي
    if (!subscription) {
      subscription =
        await prisma.subscription.create({
          data: {
            userId: req.user.id,

            plan: "FREE",

            aiRepliesLimit: 20,
            customersLimit: 50,
            productsLimit: 20,
            ordersLimit: 30,
          },
        });
    }

    res.json(subscription);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to load subscription",
    });
  }
});

// =======================
// CHANGE PLAN
// =======================

router.post("/change-plan", async (req, res) => {
  try {
    const { plan } = req.body;

    let data = {};

    if (plan === "FREE") {
      data = {
        plan: "FREE",
        aiRepliesLimit: 20,
        customersLimit: 50,
        productsLimit: 20,
        ordersLimit: 30,
      };
    }

    if (plan === "PRO") {
      data = {
        plan: "PRO",
        aiRepliesLimit: 500,
        customersLimit: 2000,
        productsLimit: 1000,
        ordersLimit: 3000,
      };
    }

    if (plan === "BUSINESS") {
      data = {
        plan: "BUSINESS",
        aiRepliesLimit: 999999,
        customersLimit: 999999,
        productsLimit: 999999,
        ordersLimit: 999999,
      };
    }

    const subscription =
      await prisma.subscription.upsert({
        where: {
          userId: req.user.id,
        },

        update: data,

        create: {
          userId: req.user.id,
          ...data,
        },
      });

    res.json(subscription);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to change plan",
    });
  }
});

// =======================
// USAGE STATS
// =======================

router.get("/usage", async (req, res) => {
  try {
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    const aiRepliesToday =
      await prisma.usageLog.aggregate({
        where: {
          userId: req.user.id,
          type: "AI_REPLY",
          date: {
            gte: today,
          },
        },

        _sum: {
          count: true,
        },
      });

    res.json({
      aiRepliesToday:
        aiRepliesToday._sum.count || 0,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to load usage",
    });
  }
});

export default router;