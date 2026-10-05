import { Router } from "express";
import { housekeepingController } from "../controllers/housekeeping.controller.js";
import { requireAuth, requireRole } from "../lib/auth.js";
import { validate } from "../middleware/validate.js";
import {
  listRoomStatusQuerySchema,
  roomStatusIdParamSchema,
  setRoomStatusSchema,
} from "../validators/housekeeping.js";

const router = Router();
const requireRoomStaff = requireRole("HOUSEKEEPER", "MANAGER", "SUPER_ADMIN");
const requireManager = requireRole("MANAGER", "SUPER_ADMIN");

router.get(
  "/status",
  requireAuth,
  requireRoomStaff,
  validate(listRoomStatusQuerySchema, "query"),
  housekeepingController.listRoomStatus.bind(housekeepingController)
);
router.put(
  "/:id/status",
  requireAuth,
  requireManager,
  validate(roomStatusIdParamSchema, "params"),
  validate(setRoomStatusSchema),
  housekeepingController.setRoomStatus.bind(housekeepingController)
);

export default router;
