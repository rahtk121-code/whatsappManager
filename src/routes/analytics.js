import express from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();
router.use(authMiddleware);

// GET DASHBOARD ANALYTICS
router.get("/dashboard", async (req, res) => {
  try {
    const userId = req.user.id;

    const now = new Date();
    const startOf7Days = new Date(now);
    startOf7Days.setDate(now.getDate() - 6);
    startOf7Days.setHours(0, 0, 0, 0);

    // Parallel queries
    const [
      totalCustomers,
      totalProducts,
      totalOrders,
      totalChats,
      recentOrders,
      ordersByStatus,
      topProducts,
      dailyOrders,
      totalRevenue,
    ] = await Promise.all([
      prisma.customer.count({ where: { userId } }),
      prisma.product.count({ where: { userId } }),
      prisma.order.count({ where: { userId } }),
      prisma.chat.count({ where: { userId } }),

      prisma.order.findMany({
        where: { userId },
        include: { customer: true, items: { include: { product: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),

      prisma.order.groupBy({
        by: ["status"],
        where: { userId },
        _count: { status: true },
      }),

      prisma.orderItem.groupBy({
        by: ["productId"],
        where: { order: { userId } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),

      prisma.order.findMany({
        where: { userId, createdAt: { gte: startOf7Days } },
        select: { createdAt: true, total: true, status: true },
      }),

      prisma.order.aggregate({
        where: { userId, status: { not: "CANCELLED" } },
        _sum: { total: true },
      }),
    ]);

    // Enrich top products with names
    const productIds = topProducts.map((tp) => tp.productId);
    const productDetails = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, price: true },
    });

    const topProductsEnriched = topProducts.map((tp) => {
      const p = productDetails.find((pd) => pd.id === tp.productId);
      return { ...p, totalSold: tp._sum.quantity || 0 };
    });

    // Build daily chart (last 7 days)
    const dailyMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailyMap[key] = { date: key, orders: 0, revenue: 0 };
    }
    for (const order of dailyOrders) {
      const key = order.createdAt.toISOString().slice(0, 10);
      if (dailyMap[key]) {
        dailyMap[key].orders += 1;
        if (order.status !== "CANCELLED") dailyMap[key].revenue += Number(order.total);
      }
    }

    res.json({
      totals: {
        customers: totalCustomers,
        products: totalProducts,
        orders: totalOrders,
        chats: totalChats,
        revenue: Number((totalRevenue._sum.total || 0).toFixed(2)),
      },
      ordersByStatus: ordersByStatus.map((s) => ({ status: s.status, count: s._count.status })),
      topProducts: topProductsEnriched,
      dailyChart: Object.values(dailyMap),
      recentOrders,
    });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

export default router;
