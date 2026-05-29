import express from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 100, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where = { userId: req.user.id };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { city: { contains: search, mode: "insensitive" } },
      ];
    }
    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
      }),
      prisma.customer.count({ where }),
    ]);
    res.json({ customers, total });
  } catch (error) {
    console.error("Get customers error:", error);
    res.status(500).json({ error: "Failed to load customers" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, phone, city, notes } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone is required" });

    const subscription = await prisma.subscription.findUnique({ where: { userId: req.user.id } });
    if (subscription) {
      const count = await prisma.customer.count({ where: { userId: req.user.id } });
      if (count >= subscription.customersLimit) {
        return res.status(403).json({ error: "لقد وصلت إلى حد العملاء في باقتك." });
      }
    }

    const customer = await prisma.customer.create({
      data: { userId: req.user.id, name: name || null, phone, city: city || null, notes: notes || null },
    });
    res.status(201).json(customer);
  } catch (error) {
    console.error("Create customer error:", error);
    if (error.code === "P2002") return res.status(400).json({ error: "رقم الهاتف مسجل مسبقاً" });
    res.status(500).json({ error: "Failed to create customer" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.customer.findFirst({ where: { id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: "Customer not found" });
    const { name, phone, city, notes } = req.body;
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name: name !== undefined ? name : existing.name,
        phone: phone !== undefined ? phone : existing.phone,
        city: city !== undefined ? city : existing.city,
        notes: notes !== undefined ? notes : existing.notes,
      },
    });
    res.json(customer);
  } catch (error) {
    console.error("Update customer error:", error);
    res.status(500).json({ error: "Failed to update customer" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.customer.findFirst({ where: { id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: "Customer not found" });
    // Check if customer has orders
    const orderCount = await prisma.order.count({ where: { customerId: id } });
    if (orderCount > 0) {
      return res.status(400).json({ error: "لا يمكن حذف عميل لديه طلبات. احذف الطلبات أولاً." });
    }
    await prisma.customer.delete({ where: { id } });
    res.json({ message: "Customer deleted successfully" });
  } catch (error) {
    console.error("Delete customer error:", error);
    res.status(500).json({ error: "Failed to delete customer" });
  }
});

export default router;
