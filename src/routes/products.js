import express from "express";

import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

router.use(authMiddleware);

// GET PRODUCTS
router.get("/", async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        userId: req.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(products);
  } catch (error) {
    console.error("Get products error:", error);

    res.status(500).json({
      error: "Failed to load products",
    });
  }
});

// CREATE PRODUCT
router.post("/", async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      stock,
      image,
    } = req.body;

    if (!name || price === undefined || price === null) {
      return res.status(400).json({
        error: "Product name and price are required",
      });
    }

    const product = await prisma.product.create({
      data: {
        userId: req.user.id,
        name,
        description: description || null,
        price: Number(price),
        stock: Number(stock || 0),
        image: image || null,
      },
    });

    res.status(201).json(product);
  } catch (error) {
    console.error("Create product error:", error);

    res.status(500).json({
      error: "Failed to create product",
    });
  }
});

// UPDATE PRODUCT
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existingProduct = await prisma.product.findFirst({
      where: {
        id,
        userId: req.user.id,
      },
    });

    if (!existingProduct) {
      return res.status(404).json({
        error: "Product not found",
      });
    }

    const {
      name,
      description,
      price,
      stock,
      image,
    } = req.body;

    const product = await prisma.product.update({
      where: {
        id,
      },
      data: {
        name: name ?? existingProduct.name,
        description:
          description !== undefined
            ? description
            : existingProduct.description,
        price:
          price !== undefined
            ? Number(price)
            : existingProduct.price,
        stock:
          stock !== undefined
            ? Number(stock)
            : existingProduct.stock,
        image:
          image !== undefined
            ? image
            : existingProduct.image,
      },
    });

    res.json(product);
  } catch (error) {
    console.error("Update product error:", error);

    res.status(500).json({
      error: "Failed to update product",
    });
  }
});

// DELETE PRODUCT
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existingProduct = await prisma.product.findFirst({
      where: {
        id,
        userId: req.user.id,
      },
    });

    if (!existingProduct) {
      return res.status(404).json({
        error: "Product not found",
      });
    }

    await prisma.product.delete({
      where: {
        id,
      },
    });

    res.json({
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Delete product error:", error);

    res.status(500).json({
      error:
        "Failed to delete product. تأكد أن المنتج غير مرتبط بطلبات.",
    });
  }
});

export default router;