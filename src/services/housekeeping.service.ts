import prisma from "../lib/prisma.js";
import { AppError } from "../middleware/error-handler.js";
import {
  AssignTaskInput,
  ListRoomStatusQuery,
  ListTasksQuery,
  SetRoomStatusInput,
} from "../validators/housekeeping.js";

const TRANSITIONS: Record<string, string[]> = {
  pending: ["assigned", "in_progress", "cancelled"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

export class HousekeepingService {
  /** Tareas de limpieza por hotel y estado (HK-3, documento §4.6). */
  async listTasks(query: ListTasksQuery) {
    return prisma.cleaningHistory.findMany({
      where: {
        hotel_id: query.hotel_id,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { created_at: "asc" },
    });
  }

  /** Asigna una tarea al personal de limpieza (HK-3). */
  async assignTask(id: string, data: AssignTaskInput) {
    const task = await prisma.cleaningHistory.findUnique({
      where: { history_id: id },
    });

    if (!task) {
      throw new AppError(404, `Task with id ${id} not found`, "Not Found");
    }
    if (task.status !== "pending") {
      throw new AppError(
        409,
        `Cannot assign task with status ${task.status}`,
        "Conflict"
      );
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.cleaningHistory.update({
        where: { history_id: id },
        data: { status: "assigned", assigned_to: data.assigned_to },
      });

      await tx.roomStatus.update({
        where: { room_status_id: task.room_status_id },
        data: { assigned_to: data.assigned_to },
      });

      return updated;
    });
  }

  /** Marca una tarea en progreso. */
  async startTask(id: string) {
    return this.transitionTask(id, "in_progress");
  }

  /**
   * Completa la tarea y deja la habitación limpia en la misma
   * transacción (HK-4: ocupación y limpieza sin conflictos).
   */
  async completeTask(id: string) {
    const task = await prisma.cleaningHistory.findUnique({
      where: { history_id: id },
    });

    if (!task) {
      throw new AppError(404, `Task with id ${id} not found`, "Not Found");
    }
    if (task.status === "done") return task;
    if (!TRANSITIONS[task.status]?.includes("done")) {
      throw new AppError(
        409,
        `Cannot complete task with status ${task.status}`,
        "Conflict"
      );
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.cleaningHistory.update({
        where: { history_id: id },
        data: { status: "done" },
      });

      await tx.roomStatus.update({
        where: { room_status_id: task.room_status_id },
        data: { status: "clean" },
      });

      return updated;
    });
  }

  /** Estados de habitación por hotel (HK-1, documento §4.6). */
  async listRoomStatus(query: ListRoomStatusQuery) {
    return prisma.roomStatus.findMany({
      where: { hotel_id: query.hotel_id },
      orderBy: { room_number: "asc" },
    });
  }

  /** Cambio manual de estado (ej. maintenance) (HK-1). */
  async setRoomStatus(id: string, data: SetRoomStatusInput) {
    const existing = await prisma.roomStatus.findUnique({
      where: { room_status_id: id },
    });

    if (!existing) {
      throw new AppError(
        404,
        `Room status with id ${id} not found`,
        "Not Found"
      );
    }

    return prisma.roomStatus.update({
      where: { room_status_id: id },
      data: { status: data.status },
    });
  }

  private async transitionTask(id: string, to: string) {
    const task = await prisma.cleaningHistory.findUnique({
      where: { history_id: id },
    });

    if (!task) {
      throw new AppError(404, `Task with id ${id} not found`, "Not Found");
    }
    if (!TRANSITIONS[task.status]?.includes(to)) {
      throw new AppError(
        409,
        `Cannot transition task from ${task.status} to ${to}`,
        "Conflict"
      );
    }

    return prisma.$transaction(async (tx) => {
      if (to === "in_progress") {
        await tx.roomStatus.update({
          where: { room_status_id: task.room_status_id },
          data: { status: "cleaning" },
        });
      }

      return tx.cleaningHistory.update({
        where: { history_id: id },
        data: { status: to },
      });
    });
  }
}

export const housekeepingService = new HousekeepingService();
