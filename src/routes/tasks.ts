import { Router } from "express";
import { housekeepingController } from "../controllers/housekeeping.controller.js";
import { requireAuth, requireRole } from "../lib/auth.js";
import { validate } from "../middleware/validate.js";
import {
  assignTaskSchema,
  listMineQuerySchema,
  listTasksQuerySchema,
  taskIdParamSchema,
} from "../validators/housekeeping.js";

const router = Router();

const requireCleaner = requireRole("HOUSEKEEPER", "MANAGER", "SUPER_ADMIN");
const requireManager = requireRole("MANAGER", "SUPER_ADMIN");

router.get(
  "/",
  requireAuth,
  requireManager,
  validate(listTasksQuerySchema, "query"),
  housekeepingController.listTasks.bind(housekeepingController)
);
// Vista propia del personal de limpieza (requiere sesion).
router.get(
  "/mine",
  requireAuth,
  validate(listMineQuerySchema, "query"),
  housekeepingController.listMine.bind(housekeepingController)
);
// Mutaciones: solo personal de limpieza o managers (con sesion).
router.put(
  "/:id/assign",
  requireAuth,
  requireManager,
  validate(taskIdParamSchema, "params"),
  validate(assignTaskSchema),
  housekeepingController.assignTask.bind(housekeepingController)
);
router.put(
  "/:id/start",
  requireAuth,
  requireCleaner,
  validate(taskIdParamSchema, "params"),
  housekeepingController.startTask.bind(housekeepingController)
);
router.put(
  "/:id/complete",
  requireAuth,
  requireCleaner,
  validate(taskIdParamSchema, "params"),
  housekeepingController.completeTask.bind(housekeepingController)
);

export default router;
