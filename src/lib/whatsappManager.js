import qrcode from "qrcode-terminal";
import pkg from "whatsapp-web.js";
import puppeteer from "puppeteer";

import { prisma } from "./prisma.js";
import { generateSmartReply } from "../services/aiService.js";

import {
  createOrderFromChat,
  buildOrderConfirmation,
  buildOrderQuestion,
} from "../services/orderService.js";

import { emitToUser } from "./socket.js";

const { Client, LocalAuth } = pkg;

const clients = new Map();

function getClientId(userId) {
  return `wa-${userId}`;
}

async function upsertSession(userId, data = {}) {
  const clientId = getClientId(userId);

  return prisma.whatsAppSession.upsert({
    where: { clientId },
    update: data,
    create: {
      userId,
      clientId,
      ...data,
    },
  });
}

function emitRealtime(userId, event, payload) {
  emitToUser(userId, event, payload);
}

async function handleIncomingMessage(userId, msg) {
  if (!msg.body || msg.fromMe) return;

  const phone = msg.from.replace("@c.us", "").replace("@lid", "");
  const text = msg.body.trim();

  let customer = await prisma.customer.findFirst({
    where: { userId, phone },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        userId,
        phone,
        name: msg._data?.notifyName || null,
        notes: "تم إنشاؤه تلقائيًا من واتساب",
      },
    });

    emitRealtime(userId, "customer:new", customer);
  }

  let chat = await prisma.chat.findFirst({
    where: {
      userId,
      customerId: customer.id,
      status: "OPEN",
    },
    include: {
      customer: true,
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!chat) {
    chat = await prisma.chat.create({
      data: {
        userId,
        customerId: customer.id,
        status: "OPEN",
      },
      include: {
        customer: true,
        messages: true,
      },
    });

    emitRealtime(userId, "chat:new", chat);
  }

  const customerMessage = await prisma.message.create({
    data: {
      chatId: chat.id,
      sender: "customer",
      content: text,
    },
  });

  emitRealtime(userId, "message:new", {
    chatId: chat.id,
    message: customerMessage,
    customer,
  });

  const refreshedChat = await prisma.chat.findUnique({
    where: { id: chat.id },
    include: {
      customer: true,
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const products = await prisma.product.findMany({
    where: { userId },
  });

  const settings = await prisma.storeSetting.findUnique({
    where: { userId },
  });

  const reply = await generateSmartReply({
    text,
    messages: refreshedChat?.messages || [],
    products,
    settings,
  });

  const orderResult = await createOrderFromChat({
    userId,
    customerId: customer.id,
    text,
    messages: refreshedChat?.messages || [],
    products,
  });

  let finalReply = reply;

  if (orderResult.needsConfirmation) {
    finalReply = `${buildOrderQuestion(orderResult)}\n\n${reply}`;
  }

  if (orderResult.created) {
    finalReply = `${buildOrderConfirmation(orderResult)}\n\n${reply}`;

    emitRealtime(userId, "order:new", orderResult.order);
  }

  const aiMessage = await prisma.message.create({
    data: {
      chatId: chat.id,
      sender: "ai",
      content: finalReply,
    },
  });

  emitRealtime(userId, "message:new", {
    chatId: chat.id,
    message: aiMessage,
    customer,
  });

  const updatedChat = await prisma.chat.update({
    where: { id: chat.id },
    data: { updatedAt: new Date() },
    include: {
      customer: true,
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  emitRealtime(userId, "chat:updated", updatedChat);

  await upsertSession(userId, {
    lastActivity: new Date(),
  });

  await msg.reply(finalReply);

  console.log(`💬 USER ${userId} | ${phone}: ${text}`);
  console.log(`🤖 USER ${userId}: ${finalReply}`);
}

export async function startClientForUser(userId) {
  if (clients.has(userId)) {
    return clients.get(userId);
  }

  const clientId = getClientId(userId);

  const startingSession = await upsertSession(userId, {
    status: "STARTING",
    isReady: false,
  });

  emitRealtime(userId, "whatsapp:status", startingSession);

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId,
    }),
    puppeteer: {
      headless: true,
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
      ],
    },
  });

  clients.set(userId, client);

  client.on("qr", async (qr) => {
    console.log(`\n📱 QR for user ${userId}:\n`);
    qrcode.generate(qr, { small: true });

    const session = await upsertSession(userId, {
      qrCode: qr,
      status: "QR_READY",
      isReady: false,
      lastActivity: new Date(),
    });

    emitRealtime(userId, "whatsapp:qr", {
      qrCode: qr,
      status: "QR_READY",
      isReady: false,
    });

    emitRealtime(userId, "whatsapp:status", session);
  });

  client.on("authenticated", async () => {
    console.log(`✅ WhatsApp authenticated for user ${userId}`);

    const session = await upsertSession(userId, {
      status: "AUTHENTICATED",
      qrCode: null,
      isReady: false,
      lastActivity: new Date(),
    });

    emitRealtime(userId, "whatsapp:status", session);
  });

  client.on("ready", async () => {
    console.log(`✅ WhatsApp ready for user ${userId}`);

    const info = client.info;

    const session = await upsertSession(userId, {
      status: "READY",
      qrCode: null,
      isReady: true,
      phone: info?.wid?.user || null,
      lastActivity: new Date(),
    });

    emitRealtime(userId, "whatsapp:status", session);
  });

  client.on("auth_failure", async (message) => {
    console.error(`❌ WhatsApp auth failure for user ${userId}:`, message);

    clients.delete(userId);

    const session = await upsertSession(userId, {
      status: "AUTH_FAILURE",
      isReady: false,
      lastActivity: new Date(),
    });

    emitRealtime(userId, "whatsapp:status", session);
  });

  client.on("disconnected", async (reason) => {
    console.log(`⚠️ WhatsApp disconnected for user ${userId}:`, reason);

    clients.delete(userId);

    const session = await upsertSession(userId, {
      status: "DISCONNECTED",
      isReady: false,
      lastActivity: new Date(),
    });

    emitRealtime(userId, "whatsapp:status", session);
  });

  client.on("message", async (msg) => {
    try {
      await handleIncomingMessage(userId, msg);
    } catch (error) {
      console.error(`WhatsApp message error for user ${userId}:`, error);
    }
  });

  client.initialize();

  return client;
}

export async function stopClientForUser(userId) {
  const client = clients.get(userId);

  if (!client) {
    const session = await upsertSession(userId, {
      status: "DISCONNECTED",
      isReady: false,
      qrCode: null,
    });

    emitRealtime(userId, "whatsapp:status", session);

    return { stopped: true };
  }

  try {
    await client.destroy();
  } catch (error) {
    console.warn("WhatsApp destroy warning:", error.message);
  }

  clients.delete(userId);

  const session = await upsertSession(userId, {
    status: "DISCONNECTED",
    isReady: false,
    qrCode: null,
    lastActivity: new Date(),
  });

  emitRealtime(userId, "whatsapp:status", session);

  return { stopped: true };
}

export async function getClientStatus(userId) {
  const clientId = getClientId(userId);

  let session = await prisma.whatsAppSession.findUnique({
    where: { clientId },
  });

  if (!session) {
    session = await upsertSession(userId, {
      status: "DISCONNECTED",
      isReady: false,
    });
  }

  return {
    ...session,
    running: clients.has(userId),
  };
}

export async function getQrCode(userId) {
  const status = await getClientStatus(userId);

  return {
    qrCode: status.qrCode,
    status: status.status,
    isReady: status.isReady,
    phone: status.phone,
  };
}

export async function startAllReadyClients() {
  const sessions = await prisma.whatsAppSession.findMany({
    where: {
      status: {
        in: ["READY", "AUTHENTICATED"],
      },
    },
  });

  for (const session of sessions) {
    try {
      await startClientForUser(session.userId);
    } catch (error) {
      console.error(
        `Failed to start WhatsApp client for user ${session.userId}:`,
        error.message
      );
    }
  }
}
