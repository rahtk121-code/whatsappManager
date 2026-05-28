import express from "express";

import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

router.use(authMiddleware);

// GET ORDERS
router.get("/", async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: {
        userId: req.user.id,
      },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(orders);
  } catch (error) {
    console.error("Get orders error:", error);

    res.status(500).json({
      error: "Failed to load orders",
    });
  }
});

// CREATE ORDER
router.post("/", async (req, res) => {
  try {
    const { customerId, items } = req.body;

    if (!customerId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: "Customer and items are required",
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

    const productIds = items.map((item) => item.productId);

    const products = await prisma.product.findMany({
      where: {
        id: {
          in: productIds,
        },
        userId: req.user.id,
      },
    });

    if (products.length !== productIds.length) {
      return res.status(400).json({
        error: "One or more products are invalid",
      });
    }

    let total = 0;

    const orderItemsData = items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      const quantity = Number(item.quantity || 1);
      const price = Number(product.price);

      total += price * quantity;

      return {
        productId: product.id,
        quantity,
        price,
      };
    });

    const order = await prisma.order.create({
      data: {
        userId: req.user.id,
        customerId,
        total,
        status: "PENDING",
        items: {
          create: orderItemsData,
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

    res.status(201).json(order);
  } catch (error) {
    console.error("Create order error:", error);

    res.status(500).json({
      error: "Failed to create order",
    });
  }
});

// UPDATE ORDER STATUS
router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      "PENDING",
      "CONFIRMED",
      "SHIPPED",
      "DELIVERED",
      "CANCELLED",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid order status",
      });
    }

    const existingOrder = await prisma.order.findFirst({
      where: {
        id,
        userId: req.user.id,
      },
    });

    if (!existingOrder) {
      return res.status(404).json({
        error: "Order not found",
      });
    }

    const order = await prisma.order.update({
      where: {
        id,
      },
      data: {
        status,
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

    res.json(order);
  } catch (error) {
    console.error("Update order status error:", error);

    res.status(500).json({
      error: "Failed to update order status",
    });
  }
});

// DELETE ORDER
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existingOrder = await prisma.order.findFirst({
      where: {
        id,
        userId: req.user.id,
      },
    });

    if (!existingOrder) {
      return res.status(404).json({
        error: "Order not found",
      });
    }

    await prisma.orderItem.deleteMany({
      where: {
        orderId: id,
      },
    });

    await prisma.order.delete({
      where: {
        id,
      },
    });

    res.json({
      message: "Order deleted successfully",
    });
  } catch (error) {
    console.error("Delete order error:", error);

    res.status(500).json({
      error: "Failed to delete order",
    });
  }
});

export default router;