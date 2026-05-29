import express from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const { search, category } = req.query;
    const where = { userId: req.user.id };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }
    if (category) where.category = category;
    const products = await prisma.product.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json(products);
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({ error: "Failed to load products" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, description, price, stock, image, category } = req.body;
    if (!name || price === undefined || price === null) {
      return res.status(400).json({ error: "Product name and price are required" });
    }
    if (Number(price) < 0) return res.status(400).json({ error: "السعر يجب أن يكون موجباً" });

    const subscription = await prisma.subscription.findUnique({ where: { userId: req.user.id } });
    if (subscription) {
      const count = await prisma.product.count({ where: { userId: req.user.id } });
      if (count >= subscription.productsLimit) {
        return res.status(403).json({ error: "لقد وصلت إلى حد المنتجات في باقتك." });
      }
    }

    const product = await prisma.product.create({
      data: {
        userId: req.user.id,
        name,
        description: description || null,
        price: Number(price),
        stock: Number(stock || 0),
        image: image || null,
        category: category || null,
      },
    });
    res.status(201).json(product);
  } catch (error) {
    console.error("Create product error:", error);
    res.status(500).json({ error: "Failed to create product" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.product.findFirst({ where: { id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: "Product not found" });
    const { name, description, price, stock, image, category } = req.body;
    if (price !== undefined && Number(price) < 0) {
      return res.status(400).json({ error: "السعر يجب أن يكون موجباً" });
    }
    const product = await prisma.product.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        description: description !== undefined ? description : existing.description,
        price: price !== undefined ? Number(price) : existing.price,
        stock: stock !== undefined ? Number(stock) : existing.stock,
        image: image !== undefined ? image : existing.image,
        category: category !== undefined ? category : existing.category,
      },
    });
    res.json(product);
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json({ error: "Failed to update product" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.product.findFirst({ where: { id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: "Product not found" });
    await prisma.product.delete({ where: { id } });
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Delete product error:", error);
    if (error.code === "P2003") {
      return res.status(400).json({ error: "لا يمكن حذف منتج مرتبط بطلبات." });
    }
    res.status(500).json({ error: "Failed to delete product" });
  }
});

export default router;
