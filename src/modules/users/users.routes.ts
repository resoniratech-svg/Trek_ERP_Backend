import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { checkRole } from "../../middleware/role.middleware";
import {
  createUser,
  getUsers,
  updateUserStatus,
  updateUserRole,
  deleteUser
} from "./users.controller";

const router = Router();

router.post(
  "/",
  authMiddleware,
  checkRole(["SUPER_ADMIN"]),
  createUser
);

router.get(
  "/",
  authMiddleware,
  checkRole(["SUPER_ADMIN", "PROJECT_MANAGER", "ACCOUNTS"]),
  getUsers
);

router.patch(
  "/:id/status",
  authMiddleware,
  checkRole(["SUPER_ADMIN"]),
  updateUserStatus
);

router.patch(
  "/:id/role",
  authMiddleware,
  checkRole(["SUPER_ADMIN"]),
  updateUserRole
);

router.delete(
  "/:id",
  authMiddleware,
  checkRole(["SUPER_ADMIN"]),
  deleteUser
);

export default router;