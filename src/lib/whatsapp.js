import qrcode from "qrcode-terminal";
import pkg from "whatsapp-web.js";

import { prisma } from "./prisma.js";
import { generateSmartReply } from "../services/aiService.js";

const { Client, LocalAuth } = pkg;

let client = null;

async function getDefaultUser() {
  const email =
    process.env.DEFAULT_USER_EMAIL ||
    "admin@test.com";

  let user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    user = await prisma.user.findFirst({
      orderBy: { createdAt: "asc" },
    });
  }

  if (!user) {
    throw new Error(
      "No user found for WhatsApp integration"
    );
  }

  return user;
}

export function initWhatsApp() {
  if (client) {
    return client;
  }

  client = new Client({
    authStrategy: new LocalAuth({
      clientId: "wa-sales-agent",
    }),

    puppeteer: {
      headless: true,
      executablePath:
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    },
  });

  client.on("qr", (qr) => {
    console.log("\n📱 امسح QR لتسجيل الدخول:\n");

    qrcode.generate(qr, {
      small: true,
    });
  });

  client.on("authenticated", () => {
    console.log("✅ WhatsApp authenticated");
  });

  client.on("ready", () => {
    console.log("✅ WhatsApp is ready");
  });

  client.on("auth_failure", (msg) => {
    console.error("❌ WhatsApp auth failure:", msg);
  });

  client.on("disconnected", (reason) => {
    console.log("⚠️ WhatsApp disconnected:", reason);
  });

  client.on("message", async (msg) => {
    try {
      if (!msg.body || msg.fromMe) {
        return;
      }

      const user = await getDefaultUser();

      const phone = msg.from.replace("@c.us", "");
      const text = msg.body.trim();

      let customer = await prisma.customer.findFirst({
        where: {
          userId: user.id,
          phone,
        },
      });

      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            userId: user.id,
            phone,
            name: msg._data?.notifyName || null,
            notes: "تم إنشاؤه تلقائيًا من واتساب",
          },
        });
      }

      let chat = await prisma.chat.findFirst({
        where: {
          userId: user.id,
          customerId: customer.id,
          status: "OPEN",
        },
        include: {
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

      if (!chat) {
        chat = await prisma.chat.create({
          data: {
            userId: user.id,
            customerId: customer.id,
            status: "OPEN",
          },
          include: {
            messages: true,
          },
        });
      }

      await prisma.message.create({
        data: {
          chatId: chat.id,
          sender: "customer",
          content: text,
        },
      });

      const refreshedChat = await prisma.chat.findUnique({
        where: {
          id: chat.id,
        },
        include: {
          messages: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });

      const products = await prisma.product.findMany({
        where: {
          userId: user.id,
        },
      });

      const settings = await prisma.storeSetting.findUnique({
        where: {
          userId: user.id,
        },
      });

      const reply = await generateSmartReply({
        text,
        messages: refreshedChat?.messages || [],
        products,
        settings,
      });

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
          updatedAt: new Date(),
        },
      });

      await msg.reply(reply);

      console.log(`💬 ${phone}: ${text}`);
      console.log(`🤖 ${reply}`);
    } catch (error) {
      console.error("WhatsApp error:", error);
    }
  });

  client.initialize();

  return client;
}

export function getWhatsAppClient() {
  return client;
}