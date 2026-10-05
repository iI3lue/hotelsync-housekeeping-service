import { AppError } from "../middleware/error-handler.js";

function userServiceUrl(): string {
  return process.env.USER_SERVICE_URL || "";
}

export interface HotelStaffMember {
  user_id: string;
  email: string;
  name: string;
  assignments: Array<{
    role: string;
    hotel_id: string | null;
    is_active: boolean;
  }>;
}

/**
 * Personal activo de un hotel segun user-service. Falla cerrado: si
 * USER_SERVICE_URL no esta configurado o user-service no responde, no se
 * puede verificar al asignado y la asignacion se rechaza en vez de
 * omitir la validacion.
 */
export async function fetchHotelStaff(
  hotelId: string,
  authorization: string | undefined
): Promise<HotelStaffMember[]> {
  const baseUrl = userServiceUrl();
  if (!baseUrl) {
    throw new AppError(
      503,
      "User service not configured, cannot validate assignee",
      "Service Unavailable"
    );
  }

  const res = await fetch(
    `${baseUrl}/admin/users?hotel_id=${encodeURIComponent(hotelId)}`,
    {
      headers: authorization ? { Authorization: authorization } : {},
      signal: AbortSignal.timeout(5000),
    }
  );
  if (!res.ok) {
    throw new AppError(
      502,
      "User service unavailable, cannot validate assignee",
      "Bad Gateway"
    );
  }
  return (await res.json()) as HotelStaffMember[];
}
