import express from "express";

import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

router.use(authMiddleware);

// GET CUSTOMERS
router.get("/", async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      where: {
        userId: req.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(customers);
  } catch (error) {
    console.error("Get customers error:", error);

    res.status(500).json({
      error: "Failed to load customers",
    });
  }
});

// CREATE CUSTOMER
router.post("/", async (req, res) => {
  try {
    const { name, phone, city, notes } = req.body;

    if (!phone) {
      return res.status(400).json({
        error: "Phone is required",
      });
    }

    const customer = await prisma.customer.create({
      data: {
        userId: req.user.id,
        name: name || null,
        phone,
        city: city || null,
        notes: notes || null,
      },
    });

    res.status(201).json(customer);
  } catch (error) {
    console.error("Create customer error:", error);

    res.status(500).json({
      error: "Failed to create customer",
    });
  }
});

// UPDATE CUSTOMER
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existingCustomer = await prisma.customer.findFirst({
      where: {
        id,
        userId: req.user.id,
      },
    });

    if (!existingCustomer) {
      return res.status(404).json({
        error: "Customer not found",
      });
    }

    const { name, phone, city, notes } = req.body;

    const customer = await prisma.customer.update({
      where: {
        id,
      },
      data: {
        name: name !== undefined ? name : existingCustomer.name,
        phone: phone !== undefined ? phone : existingCustomer.phone,
        city: city !== undefined ? city : existingCustomer.city,
        notes: notes !== undefined ? notes : existingCustomer.notes,
      },
    });

    res.json(customer);
  } catch (error) {
    console.error("Update customer error:", error);

    res.status(500).json({
      error: "Failed to update customer",
    });
  }
});

// DELETE CUSTOMER
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existingCustomer = await prisma.customer.findFirst({
      where: {
        id,
        userId: req.user.id,
      },
    });

    if (!existingCustomer) {
      return res.status(404).json({
        error: "Customer not found",
      });
    }

    await prisma.customer.delete({
      where: {
        id,
      },
    });

    res.json({
      message: "Customer deleted successfully",
    });
  } catch (error) {
    console.error("Delete customer error:", error);

    res.status(500).json({
      error:
        "Failed to delete customer. تأكد أن العميل غير مرتبط بطلبات أو محادثات.",
    });
  }
});

export default router;