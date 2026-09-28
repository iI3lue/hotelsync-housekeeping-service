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
  assigned_to: z.string().min(1).max(100),
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
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;
export type ListRoomStatusQuery = z.infer<typeof listRoomStatusQuerySchema>;
export type SetRoomStatusInput = z.infer<typeof setRoomStatusSchema>;
