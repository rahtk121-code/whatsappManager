import express from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    let settings = await prisma.storeSetting.findUnique({ where: { userId: req.user.id } });
    if (!settings) {
      settings = await prisma.storeSetting.create({ data: { userId: req.user.id } });
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: "Failed to load settings" });
  }
});

router.put("/", async (req, res) => {
  try {
    const { storeName, storeDescription, aiTone, aiLanguage, welcomeMessage, shippingPolicy, paymentPolicy, autoReply } = req.body;
    const settings = await prisma.storeSetting.upsert({
      where: { userId: req.user.id },
      update: { storeName, storeDescription, aiTone, aiLanguage, welcomeMessage, shippingPolicy, paymentPolicy, autoReply: autoReply ?? true },
      create: { userId: req.user.id, storeName, storeDescription, aiTone, aiLanguage, welcomeMessage, shippingPolicy, paymentPolicy, autoReply: autoReply ?? true },
    });
    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
