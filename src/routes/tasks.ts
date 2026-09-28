import { Router } from "express";
import { housekeepingController } from "../controllers/housekeeping.controller.js";
import { validate } from "../middleware/validate.js";
import {
  assignTaskSchema,
  listTasksQuerySchema,
  taskIdParamSchema,
} from "../validators/housekeeping.js";

const router = Router();

router.get(
  "/",
  validate(listTasksQuerySchema, "query"),
  housekeepingController.listTasks.bind(housekeepingController)
);
router.put(
  "/:id/assign",
  validate(taskIdParamSchema, "params"),
  validate(assignTaskSchema),
  housekeepingController.assignTask.bind(housekeepingController)
);
router.put(
  "/:id/start",
  validate(taskIdParamSchema, "params"),
  housekeepingController.startTask.bind(housekeepingController)
);
router.put(
  "/:id/complete",
  validate(taskIdParamSchema, "params"),
  housekeepingController.completeTask.bind(housekeepingController)
);

export default router;
