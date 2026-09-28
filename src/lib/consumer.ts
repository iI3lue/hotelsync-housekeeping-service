import prisma from "./prisma.js";
import { consume, TASKS_QUEUE } from "./broker.js";
import { fetchBooking } from "./booking-client.js";

export interface CheckoutCompletedPayload {
  booking_id: string;
  physical_room_number: string;
}

type PrismaLike = typeof prisma;

/** Estados válidos de habitación física (HK-1, documento §5.6). */
export const ROOM_STATUSES = ["dirty", "cleaning", "clean", "maintenance"] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

/** Estados válidos de la tarea de limpieza. */
export const TASK_STATUSES = ["pending", "assigned", "in_progress", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * Aplica `checkout.completed` al modelo de housekeeping (HK-2, HK-4):
 * marca la habitación como sucia y crea la tarea de limpieza.
 * Idempotente: `booking_id` es único en el historial y el upsert del
 * estado deja el mismo valor ante replays del broker.
 */
export async function handleCheckoutCompleted(
  db: PrismaLike,
  payload: CheckoutCompletedPayload
): Promise<void> {
  const booking = await fetchBooking(payload.booking_id);

  if (!booking) {
    throw new Error(
      `Booking ${payload.booking_id} not found, requeue checkout.completed`
    );
  }

  const roomStatus = await db.roomStatus.upsert({
    where: {
      hotel_id_room_number: {
        hotel_id: booking.hotel_id,
        room_number: payload.physical_room_number,
      },
    },
    create: {
      hotel_id: booking.hotel_id,
      room_number: payload.physical_room_number,
      status: "dirty",
    },
    update: { status: "dirty" },
  });

  await db.cleaningHistory.upsert({
    where: { booking_id: payload.booking_id },
    create: {
      room_status_id: roomStatus.room_status_id,
      booking_id: payload.booking_id,
      hotel_id: booking.hotel_id,
      room_number: payload.physical_room_number,
      status: "pending",
    },
    update: {},
  });
}

export async function handleHousekeepingEvent(
  db: PrismaLike,
  routingKey: string,
  payload: CheckoutCompletedPayload
): Promise<void> {
  if (routingKey === "checkout.completed") {
    await handleCheckoutCompleted(db, payload);
    return;
  }

  console.warn(`[consumer] routing key ignorada: ${routingKey}`);
}

/**
 * Arranca el consumidor de tareas: cola durable `housekeeping.tasks`
 * bindeada a `checkout.completed`.
 */
export async function startConsumer(): Promise<void> {
  await consume(
    TASKS_QUEUE,
    ["checkout.completed"],
    (routingKey, payload) => handleHousekeepingEvent(prisma, routingKey, payload)
  );
}
