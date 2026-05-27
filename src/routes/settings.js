import express from "express";

import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

router.use(authMiddleware);

// GET SETTINGS
router.get("/", async (req, res) => {
  try {
    let settings = await prisma.storeSetting.findUnique({
      where: {
        userId: req.user.id,
      },
    });

    if (!settings) {
      settings = await prisma.storeSetting.create({
        data: {
          userId: req.user.id,
        },
      });
    }

    res.json(settings);
  } catch (error) {
    res.status(500).json({
      error: "Failed to load settings",
    });
  }
});

// UPDATE SETTINGS
router.put("/", async (req, res) => {
  try {
    const {
      storeName,
      storeDescription,
      aiTone,
      aiLanguage,
      welcomeMessage,
      shippingPolicy,
      paymentPolicy,
    } = req.body;

    const settings = await prisma.storeSetting.upsert({
      where: {
        userId: req.user.id,
      },
      update: {
        storeName,
        storeDescription,
        aiTone,
        aiLanguage,
        welcomeMessage,
        shippingPolicy,
        paymentPolicy,
      },
      create: {
        userId: req.user.id,
        storeName,
        storeDescription,
        aiTone,
        aiLanguage,
        welcomeMessage,
        shippingPolicy,
        paymentPolicy,
      },
    });

    res.json(settings);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to update settings",
    });
  }
});

export default router;