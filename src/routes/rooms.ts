import { Router } from "express";
import { housekeepingController } from "../controllers/housekeeping.controller.js";
import { validate } from "../middleware/validate.js";
import {
  listRoomStatusQuerySchema,
  roomStatusIdParamSchema,
  setRoomStatusSchema,
} from "../validators/housekeeping.js";

const router = Router();

router.get(
  "/status",
  validate(listRoomStatusQuerySchema, "query"),
  housekeepingController.listRoomStatus.bind(housekeepingController)
);
router.put(
  "/:id/status",
  validate(roomStatusIdParamSchema, "params"),
  validate(setRoomStatusSchema),
  housekeepingController.setRoomStatus.bind(housekeepingController)
);

export default router;
