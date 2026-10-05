import { AppError } from "../middleware/error-handler.js";

const BOOKING_API =
  process.env.BOOKING_SERVICE_URL || "http://localhost:3004/v1";
const BOOKING_SERVICE_KEY = process.env.BOOKING_SERVICE_KEY || "";

export interface BookingRef {
  booking_id: string;
  guest_id: string;
  hotel_id: string;
  room_type_id: string;
  check_in: string;
  check_out: string;
  status: string;
  channel: string;
  total_amount: number | string;
}

/**
 * Cliente HTTP hacia Booking Service (comunicación síncrona REST, fuente §6).
 * Sin FK entre bases: la referencia cruzada es solo el UUID de la reserva.
 * Housekeeping lo usa para resolver el hotel del checkout, porque
 * `checkout.completed` trae solo booking_id + habitación física y no se
 * quiso tocar Front Desk para esta versión (evento mínimo, tolerante).
 * Timeout de 3s por llamada (documento de arquitectura §6.5).
 */
async function bookingFetch<T>(path: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${BOOKING_API}${path}`, {
      headers: BOOKING_SERVICE_KEY
        ? { "x-housekeeping-key": BOOKING_SERVICE_KEY }
        : {},
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    throw new AppError(
      502,
      "Booking Service unavailable",
      "Bad Gateway"
    );
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new AppError(
      502,
      `Booking Service error: ${res.status}`,
      "Bad Gateway"
    );
  }

  return (await res.json()) as T;
}

export async function fetchBooking(id: string): Promise<BookingRef | null> {
  return bookingFetch<BookingRef>(`/bookings/${id}`);
}
