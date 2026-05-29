import express from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();
router.use(authMiddleware);

// GET ORDERS
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where = { userId: req.user.id };
    if (status) where.status = status;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { customer: true, items: { include: { product: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
      }),
      prisma.order.count({ where }),
    ]);

    res.json({ orders, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ error: "Failed to load orders" });
  }
});

// CREATE ORDER
router.post("/", async (req, res) => {
  try {
    const { customerId, items, notes } = req.body;

    if (!customerId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Customer and items are required" });
    }

    // Check subscription limit
    const subscription = await prisma.subscription.findUnique({ where: { userId: req.user.id } });
    if (subscription) {
      const orderCount = await prisma.order.count({ where: { userId: req.user.id } });
      if (orderCount >= subscription.ordersLimit) {
        return res.status(403).json({ error: "لقد وصلت إلى حد الطلبات في باقتك." });
      }
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, userId: req.user.id },
    });
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, userId: req.user.id },
    });
    if (products.length !== productIds.length) {
      return res.status(400).json({ error: "One or more products are invalid" });
    }

    let total = 0;
    const orderItemsData = items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      const quantity = Number(item.quantity || 1);
      const price = Number(product.price);
      total += price * quantity;
      return { productId: product.id, quantity, price };
    });

    const order = await prisma.order.create({
      data: {
        userId: req.user.id,
        customerId,
        total,
        status: "PENDING",
        notes: notes || null,
        items: { create: orderItemsData },
      },
      include: { customer: true, items: { include: { product: true } } },
    });

    res.status(201).json(order);
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// UPDATE ORDER STATUS — restores stock on cancel, updates purchaseScore on delivery
router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid order status" });
    }

    const existingOrder = await prisma.order.findFirst({
      where: { id, userId: req.user.id },
      include: { items: { include: { product: true } } },
    });
    if (!existingOrder) return res.status(404).json({ error: "Order not found" });

    const prevStatus = existingOrder.status;

    // Restore stock if cancelling a non-cancelled order
    if (status === "CANCELLED" && prevStatus !== "CANCELLED") {
      for (const item of existingOrder.items) {
        await prisma.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }

    // Re-deduct stock if un-cancelling
    if (prevStatus === "CANCELLED" && status !== "CANCELLED") {
      for (const item of existingOrder.items) {
        await prisma.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }
    }

    const order = await prisma.order.update({
      where: { id },
      data: { status },
      include: { customer: true, items: { include: { product: true } } },
    });

    // Update purchaseScore on delivery
    if (status === "DELIVERED" && prevStatus !== "DELIVERED") {
      await prisma.customer.update({
        where: { id: existingOrder.customerId },
        data: { purchaseScore: { increment: 1 } },
      });
    }

    res.json(order);
  } catch (error) {
    console.error("Update order status error:", error);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

// UPDATE ORDER NOTES
router.patch("/:id/notes", async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const existing = await prisma.order.findFirst({ where: { id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: "Order not found" });
    const order = await prisma.order.update({ where: { id }, data: { notes } });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: "Failed to update notes" });
  }
});

// DELETE ORDER
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const existingOrder = await prisma.order.findFirst({
      where: { id, userId: req.user.id },
      include: { items: true },
    });
    if (!existingOrder) return res.status(404).json({ error: "Order not found" });

    // Restore stock if order wasn't cancelled
    if (existingOrder.status !== "CANCELLED") {
      for (const item of existingOrder.items) {
        await prisma.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }

    await prisma.orderItem.deleteMany({ where: { orderId: id } });
    await prisma.order.delete({ where: { id } });

    res.json({ message: "Order deleted successfully" });
  } catch (error) {
    console.error("Delete order error:", error);
    res.status(500).json({ error: "Failed to delete order" });
  }
});

export default router;
