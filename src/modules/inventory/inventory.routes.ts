import { Router } from "express";
import { getProducts, getMovements, getSalesOrders, getInventoryStats, createProduct, getProductById, updateProduct, deleteProduct, createSalesOrder, updateSalesOrderStatus, reorderProduct } from "./inventory.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { checkRole } from "../../middleware/role.middleware";

const router = Router();

router.get("/", authMiddleware, getProducts); // Handle /api/products
router.get("/products", authMiddleware, getProducts); // Handle /api/inventory/products

// Product CRUD routes (Static / No-params first)
router.post("/", authMiddleware, checkRole(["SUPER_ADMIN", "ACCOUNTS"]), createProduct);
router.post("/products", authMiddleware, checkRole(["SUPER_ADMIN", "ACCOUNTS"]), createProduct);

router.post("/sales-orders", authMiddleware, checkRole(["SUPER_ADMIN", "PROJECT_MANAGER"]), createSalesOrder);
router.patch("/products/:id/reorder", authMiddleware, checkRole(["SUPER_ADMIN", "ACCOUNTS"]), reorderProduct);
router.patch("/sales-orders/:id/status", authMiddleware, checkRole(["SUPER_ADMIN", "PROJECT_MANAGER"]), updateSalesOrderStatus);

router.get("/movements", authMiddleware, getMovements);
router.get("/sales-orders", authMiddleware, getSalesOrders);
router.get("/profit-stats", authMiddleware, getInventoryStats);

// Product CRUD routes (Parameterized endpoints last to avoid intercepting statics)
router.get("/:id", authMiddleware, getProductById);
router.get("/products/:id", authMiddleware, getProductById);

router.put("/:id", authMiddleware, checkRole(["SUPER_ADMIN", "ACCOUNTS"]), updateProduct);
router.put("/products/:id", authMiddleware, checkRole(["SUPER_ADMIN", "ACCOUNTS"]), updateProduct);

router.delete("/:id", authMiddleware, checkRole(["SUPER_ADMIN", "ACCOUNTS"]), deleteProduct);
router.delete("/products/:id", authMiddleware, checkRole(["SUPER_ADMIN", "ACCOUNTS"]), deleteProduct);

export default router;
