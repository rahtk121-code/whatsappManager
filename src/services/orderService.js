import { prisma } from "../lib/prisma.js";
import {
  findBestProduct,
  normalize,
  isClosingMessage,
} from "./aiService.js";

export function detectStrongOrderIntent(text = "") {
  const t = normalize(text);

  if (isClosingMessage(text)) {
    return false;
  }

  return /(احجز|احجزه|اطلب|اطلبه|اريد اشتري|ابغى اشتري|اشتي اشتري|خذ الطلب|جهز|جهزه|اكد الطلب|أكد الطلب|نعم احجز|نعم اطلب|تم احجز|تمام احجز|اريد واحد|ابغى واحد|اشتي واحد|اريد 2|ابغى 2|اشتي 2)/.test(
    t
  );
}

export function detectSoftOrderIntent(text = "") {
  const t = normalize(text);

  if (isClosingMessage(text)) {
    return false;
  }

  return /(اريد|ابغى|اشتي|تمام|نعم|اوكي|ok|واحد|اثنين|2|1)/.test(t);
}

export function extractQuantity(text = "") {
  const t = normalize(text);

  const numberMatch = t.match(/\b(\d+)\b/);

  if (numberMatch) {
    return Math.max(1, Number(numberMatch[1]));
  }

  if (/(اثنين|حبتين|قطعتين)/.test(t)) return 2;
  if (/(ثلاثه|ثلاثة)/.test(t)) return 3;
  if (/(اربعه|اربعة)/.test(t)) return 4;
  if (/(خمسه|خمسة)/.test(t)) return 5;

  return 1;
}

export function findRecentProductFromMessages({
  text,
  messages = [],
  products = [],
}) {
  const recentMessages = messages
    .slice(-8)
    .map((m) => m.content)
    .join(" ");

  const combinedText = `${recentMessages} ${text}`;

  return findBestProduct(combinedText, products);
}

export async function createOrderFromChat({
  userId,
  customerId,
  text,
  messages = [],
  products = [],
}) {
  const strongIntent = detectStrongOrderIntent(text);
  const softIntent = detectSoftOrderIntent(text);

  if (!strongIntent && !softIntent) {
    return {
      created: false,
      needsConfirmation: false,
      reason: "NO_ORDER_INTENT",
    };
  }

  const product = findRecentProductFromMessages({
    text,
    messages,
    products,
  });

  if (!product) {
    return {
      created: false,
      needsConfirmation: false,
      reason: "NO_PRODUCT_MATCH",
    };
  }

  if (!strongIntent && softIntent) {
    return {
      created: false,
      needsConfirmation: true,
      reason: "NEEDS_CONFIRMATION",
      product,
      quantity: extractQuantity(text),
    };
  }

  if (Number(product.stock) <= 0) {
    return {
      created: false,
      needsConfirmation: false,
      reason: "OUT_OF_STOCK",
      product,
    };
  }

  const quantity = Math.min(extractQuantity(text), Number(product.stock));

  const total = Number(product.price) * quantity;

  const order = await prisma.order.create({
    data: {
      userId,
      customerId,
      status: "PENDING",
      total,
      items: {
        create: [
          {
            productId: product.id,
            quantity,
            price: Number(product.price),
          },
        ],
      },
    },
    include: {
      customer: true,
      items: {
        include: {
          product: true,
        },
      },
    },
  });

  await prisma.product.update({
    where: {
      id: product.id,
    },
    data: {
      stock: Number(product.stock) - quantity,
    },
  });

  return {
    created: true,
    needsConfirmation: false,
    order,
    product,
    quantity,
    total,
  };
}

export function buildOrderConfirmation(result) {
  if (!result?.created) return null;

  return `تم تسجيل طلبك ✅

المنتج: ${result.product.name}
الكمية: ${result.quantity}
الإجمالي: ${result.total}

أرسل اسمك والمدينة لتأكيد التوصيل.`;
}

export function buildOrderQuestion(result) {
  if (!result?.needsConfirmation || !result?.product) return null;

  return `هل تقصد تأكيد طلب ${result.product.name}؟

إذا نعم اكتب: نعم احجزه ✅`;
}