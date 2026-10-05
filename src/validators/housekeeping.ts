import { z } from "zod";

export const ROOM_STATUSES = ["dirty", "cleaning", "clean", "maintenance"] as const;
export const TASK_STATUSES = ["pending", "assigned", "in_progress", "done", "cancelled"] as const;

export const listTasksQuerySchema = z.object({
  hotel_id: z.string().uuid(),
  status: z.enum(TASK_STATUSES).optional(),
});

export const taskIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const assignTaskSchema = z.object({
  // UUID de la cuenta del personal (verificado contra el JWT en la fase de
  // roles; reemplaza el nombre libre que se prestaba a suplantacion).
  assigned_to_user_id: z.string().uuid(),
});

export const listMineQuerySchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
});

export const listRoomStatusQuerySchema = z.object({
  hotel_id: z.string().uuid(),
});

export const roomStatusIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const setRoomStatusSchema = z.object({
  status: z.enum(ROOM_STATUSES),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type ListMineQuery = z.infer<typeof listMineQuerySchema>;
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;
export type ListRoomStatusQuery = z.infer<typeof listRoomStatusQuerySchema>;
export type SetRoomStatusInput = z.infer<typeof setRoomStatusSchema>;
