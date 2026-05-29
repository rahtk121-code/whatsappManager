import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export function normalize(text = "") {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isClosingMessage(text = "") {
  const t = normalize(text);
  return /(شكرا|شكر|مشكور|تسلم|يعطيك العافيه|يعطيك العافية|تمام|خلاص|اوكي|ok|thanks|thank you|جزاك الله خير|ما قصرت|ماقصرت|بارك الله فيك)/.test(t);
}

export function detectIntent(text = "") {
  const t = normalize(text);
  if (isClosingMessage(text)) return "CLOSING";
  if (/(احجز|اطلب|اشتري|ابغى اشتري|اريد اشتري|اكد الطلب|جهزه|خذ الطلب)/.test(t)) return "ORDER";
  if (/(شكوى|مشكله|مشكلة|ما وصل|غلط|ارجاع|استرداد|شاكي)/.test(t)) return "COMPLAINT";
  if (/(كم سعر|بكم|متوفر|موجود|هل عندك|هل لديك|اعطيني|وصف|مواصفات|سعر)/.test(t)) return "INQUIRY";
  return "INQUIRY";
}

export function findBestProduct(text, products = []) {
  const t = normalize(text);
  let best = null;
  let bestScore = 0;
  for (const product of products) {
    const name = normalize(product.name || "");
    let score = 0;
    if (t.includes(name) || name.includes(t)) score += 10;
    for (const word of t.split(" ")) {
      if (word.length >= 3 && name.includes(word)) score += 3;
    }
    if (t.includes("ايفون") && (name.includes("iphone") || name.includes("ايفون"))) score += 10;
    if (t.includes("سامسونج") && (name.includes("samsung") || name.includes("سامسونج"))) score += 10;
    if (score > bestScore) { best = product; bestScore = score; }
  }
  return bestScore > 0 ? best : null;
}

export function getStyle(settings) {
  const language = settings?.aiLanguage || "arabic";
  const tone = settings?.aiTone || "friendly";
  const languages = {
    arabic: "تكلم بعربية طبيعية بسيطة.",
    yemeni: "تكلم بلهجة يمنية خفيفة ومهذبة مثل: حياك، تمام، بإذن الله، معك.",
    gulf: "تكلم بلهجة خليجية خفيفة ومهذبة مثل: حياك الله، أبشر، تمام.",
    formal: "تكلم بفصحى واضحة ومهذبة بدون جمود.",
  };
  const tones = {
    friendly: "أسلوبك ودود وقريب من العميل.",
    professional: "أسلوبك احترافي ومنظم.",
    sales: "أسلوبك مقنع للبيع بدون ضغط.",
    luxury: "أسلوبك راقٍ ومناسب للمنتجات عالية القيمة.",
  };
  return `${languages[language] || languages.arabic}\n${tones[tone] || tones.friendly}`;
}

export function localReply({ text, products = [], settings }) {
  const product = findBestProduct(text, products);
  const storeName = settings?.storeName || "متجرنا";
  if (isClosingMessage(text)) {
    return settings?.aiLanguage === "formal" ? "على الرحب والسعة، سعدنا بخدمتك 🌟" : "العفو، حياك الله 🌟";
  }
  if (product) {
    return `نعم، ${product.name} متوفر لدينا ✅\n\n💰 السعر: ${product.price}\n📦 المتوفر: ${product.stock}\n\nهل تريد أحجزه لك؟`;
  }
  if (products.length > 0) {
    const list = products.slice(0, 5).map((p) => `• ${p.name} — ${p.price}`).join("\n");
    return `حياك الله في ${storeName} 🌟\n\nالمتوفر حاليًا:\n${list}\n\nأي منتج يناسبك؟`;
  }
  return `حياك الله في ${storeName} 🌟\nحاليًا لا توجد منتجات مسجلة.`;
}

export async function generateChatSummary(messages = []) {
  if (!process.env.GROQ_API_KEY || messages.length < 4) return null;
  try {
    const history = messages
      .slice(-20)
      .map((m) => `${m.sender === "customer" ? "العميل" : "البائع"}: ${m.content}`)
      .join("\n");
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.3,
      max_tokens: 100,
      messages: [
        {
          role: "system",
          content: "أنت مساعد يلخص المحادثات. اكتب ملخصاً من جملة واحدة أو جملتين باللغة العربية يصف ما يريده العميل وحالة الطلب إن وجدت. لا تكتب أي شيء آخر.",
        },
        { role: "user", content: `لخص هذه المحادثة:\n${history}` },
      ],
    });
    return completion.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

export async function generateSmartReply({ text, messages = [], products = [], settings = null }) {
  if (isClosingMessage(text)) {
    return settings?.aiLanguage === "formal" ? "على الرحب والسعة، سعدنا بخدمتك 🌟" : "العفو، حياك الله 🌟";
  }

  const productText =
    products.length === 0
      ? "لا توجد منتجات مسجلة."
      : products
          .map((p) => `\nالمنتج: ${p.name}\nالسعر: ${p.price}\nالمخزون: ${p.stock}\nالوصف: ${p.description || "لا يوجد"}`)
          .join("\n");

  const history =
    messages.length === 0
      ? "لا توجد محادثة سابقة."
      : messages
          .slice(-12)
          .map((m) => `${m.sender === "customer" ? "العميل" : "البائع"}: ${m.content}`)
          .join("\n");

  const matchedProduct = findBestProduct(text, products);

  if (!process.env.GROQ_API_KEY) {
    return localReply({ text, products, settings });
  }

  try {
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.55,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content: `أنت بائع واتساب محترف جدًا، تتحدث كإنسان وليس كروبوت.

قواعد صارمة:
- رد بالعربية فقط.
- لا تقل إنك ذكاء اصطناعي.
- لا تخترع منتجات أو أسعار أو مخزون.
- اعتمد فقط على قائمة المنتجات.
- لا تكرر "كيف أساعدك؟" في كل رد.
- إذا قال العميل شكرًا أو تمام أو عبارة ختام، اختم بلطف فقط.
- إذا سأل عن منتج موجود، اذكر السعر والمخزون بوضوح.
- إذا المنتج غير موجود، قل بلطف إنه غير متوفر، واقترح المتوفر فقط إن وجد.
- إذا كانت نية العميل شراء، شجعه بلطف واطلب الكمية أو المدينة.
- إذا كان العميل غاضبًا، اعتذر باختصار ثم جاوب مباشرة.
- الرد قصير ومناسب لواتساب.

أسلوب المتجر:
${getStyle(settings)}

اسم المتجر: ${settings?.storeName || "متجرنا"}
وصف المتجر: ${settings?.storeDescription || "متجر إلكتروني"}
سياسة الشحن: ${settings?.shippingPolicy || "غير محددة"}
سياسة الدفع: ${settings?.paymentPolicy || "غير محددة"}

أفضل منتج مطابق:
${matchedProduct ? `${matchedProduct.name} | السعر ${matchedProduct.price} | المخزون ${matchedProduct.stock}` : "لا يوجد"}`,
        },
        {
          role: "user",
          content: `المنتجات:\n${productText}\n\nالمحادثة:\n${history}\n\nآخر رسالة من العميل:\n${text}\n\nاكتب الرد المناسب فقط.`,
        },
      ],
    });

    return (
      completion.choices?.[0]?.message?.content?.trim() ||
      localReply({ text, products, settings })
    );
  } catch (error) {
    console.warn("Groq failed:", error.message);
    return localReply({ text, products, settings });
  }
}
