import prisma from "../lib/prisma.js";
import { AppError } from "../middleware/error-handler.js";
import type { AuthClaims } from "../lib/auth.js";
import { fetchHotelStaff } from "../lib/user-client.js";
import {
  AssignTaskInput,
  ListMineQuery,
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
  private requireHotelRole(
    actor: AuthClaims,
    hotelId: string,
    roles: string[]
  ): void {
    if (actor.role === "SUPER_ADMIN") return;
    if (!roles.includes(actor.role) || actor.hotel_id !== hotelId) {
      throw new AppError(403, "Not allowed for this hotel", "Forbidden");
    }
  }

  /**
   * Tareas de limpieza por hotel y estado (HK-3). El actor solo lista
   * tareas de su propio hotel; SUPER_ADMIN puede listar cualquiera.
   */
  async listTasks(query: ListTasksQuery, actor: AuthClaims) {
    if (actor.role !== "SUPER_ADMIN" && actor.role !== "MANAGER") {
      throw new AppError(403, "Not allowed to list tasks", "Forbidden");
    }
    const hotelId = actor.role === "SUPER_ADMIN" ? query.hotel_id : actor.hotel_id;
    if (!hotelId) {
      throw new AppError(403, "Hotel scope required", "Forbidden");
    }
    return prisma.cleaningHistory.findMany({
      where: {
        hotel_id: hotelId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { created_at: "asc" },
    });
  }

  /** Tareas asignadas al usuario del JWT (vista del Housekeeper). */
  async listMine(userId: string, query: ListMineQuery) {
    return prisma.cleaningHistory.findMany({
      where: {
        assigned_to_user_id: userId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { created_at: "asc" },
    });
  }

  /**
   * Asigna una tarea a una cuenta del personal por UUID (HK-3). Verifica
   * contra user-service que sea personal activo del mismo hotel.
   */
  async assignTask(
    id: string,
    data: AssignTaskInput,
    actor: AuthClaims,
    authorization?: string
  ) {
    const task = await prisma.cleaningHistory.findUnique({
      where: { history_id: id },
    });

    if (!task) {
      throw new AppError(404, `Task with id ${id} not found`, "Not Found");
    }
    this.requireHotelRole(actor, task.hotel_id, ["MANAGER"]);
    if (task.status !== "pending") {
      throw new AppError(
        409,
        `Cannot assign task with status ${task.status}`,
        "Conflict"
      );
    }

    const staff = await fetchHotelStaff(task.hotel_id, authorization);
    const member = staff.find((s) => s.user_id === data.assigned_to_user_id);
    const eligible = member?.assignments.some(
      (a) =>
        a.is_active &&
        a.hotel_id === task.hotel_id &&
        (a.role === "HOUSEKEEPER" || a.role === "MANAGER")
    );
    if (!eligible) {
      throw new AppError(
        403,
        "Assignee is not active cleaning staff of this hotel",
        "Forbidden"
      );
    }

    return prisma.cleaningHistory.update({
      where: { history_id: id },
      data: {
        status: "assigned",
        assigned_to_user_id: data.assigned_to_user_id,
        assigned_to: null,
      },
    });
  }

  /** Marca una tarea en progreso. */
  async startTask(id: string, actor: AuthClaims) {
    const task = await prisma.cleaningHistory.findUnique({
      where: { history_id: id },
    });
    if (!task) {
      throw new AppError(404, `Task with id ${id} not found`, "Not Found");
    }
    this.requireHotelRole(actor, task.hotel_id, ["HOUSEKEEPER", "MANAGER"]);
    if (actor.role === "HOUSEKEEPER" && task.assigned_to_user_id !== actor.sub) {
      throw new AppError(403, "Only the assigned housekeeper can start this task", "Forbidden");
    }
    return this.transitionTask(id, "in_progress");
  }

  /**
   * Completa la tarea y deja la habitación limpia en la misma
   * transacción (HK-4: ocupación y limpieza sin conflictos). Registra
   * quien la completo y cuando.
   */
  async completeTask(
    id: string,
    completedByUserId?: string,
    actor?: AuthClaims
  ) {
    const task = await prisma.cleaningHistory.findUnique({
      where: { history_id: id },
    });

    if (!task) {
      throw new AppError(404, `Task with id ${id} not found`, "Not Found");
    }
    if (!actor) {
      throw new AppError(401, "Missing actor", "Unauthorized");
    }
    this.requireHotelRole(actor, task.hotel_id, ["HOUSEKEEPER", "MANAGER"]);
    const isAssignedHousekeeper =
      actor.role === "HOUSEKEEPER" && task.assigned_to_user_id === actor.sub;
    const isManagerOfHotel =
      actor.role === "MANAGER" && actor.hotel_id === task.hotel_id;
    if (
      actor.role !== "SUPER_ADMIN" &&
      !isAssignedHousekeeper &&
      !isManagerOfHotel
    ) {
      throw new AppError(
        403,
        "Only the assignee or a manager of this hotel can complete the task",
        "Forbidden"
      );
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
        data: {
          status: "done",
          completed_by_user_id: completedByUserId ?? task.assigned_to_user_id,
          completed_at: new Date(),
        },
      });

      await tx.roomStatus.update({
        where: { room_status_id: task.room_status_id },
        data: { status: "clean" },
      });

      return updated;
    });
  }

  /** Estados de habitación por hotel (HK-1, documento §4.6). */
  async listRoomStatus(query: ListRoomStatusQuery, actor: AuthClaims) {
    const hotelId = actor.role === "SUPER_ADMIN" ? query.hotel_id : query.hotel_id;
    this.requireHotelRole(actor, hotelId, ["HOUSEKEEPER", "MANAGER"]);
    return prisma.roomStatus.findMany({
      where: { hotel_id: hotelId },
      orderBy: { room_number: "asc" },
    });
  }

  /** Cambio manual de estado (ej. maintenance) (HK-1). */
  async setRoomStatus(id: string, data: SetRoomStatusInput, actor: AuthClaims) {
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
    this.requireHotelRole(actor, existing.hotel_id, ["MANAGER"]);

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
