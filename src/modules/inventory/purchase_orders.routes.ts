import { Router } from "express";
import { getPurchaseOrders, createPurchaseOrder, updatePurchaseOrderStatus, deletePurchaseOrder } from "./purchase_orders.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { checkRole } from "../../middleware/role.middleware";

const router = Router();

router.get("/", authMiddleware, getPurchaseOrders);
router.post("/", authMiddleware, checkRole(["SUPER_ADMIN", "ACCOUNTS"]), createPurchaseOrder);
router.patch("/:id/status", authMiddleware, checkRole(["SUPER_ADMIN", "ACCOUNTS"]), updatePurchaseOrderStatus);
router.delete("/:id", authMiddleware, checkRole(["SUPER_ADMIN", "ACCOUNTS"]), deletePurchaseOrder);

export default router;
