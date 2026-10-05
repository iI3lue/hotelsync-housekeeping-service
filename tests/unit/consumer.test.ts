import { handleHousekeepingEvent } from "../../src/lib/consumer.js";
import * as bookingClient from "../../src/lib/booking-client.js";

const BOOKING_ID = "a1b2c3d4-e5f6-4890-abcd-ef1234567890";
const HOTEL_ID = "c1b2c3d4-e5f6-4890-abcd-ef1234567890";
const ROOM_STATUS_ID = "e1b2c3d4-e5f6-4890-abcd-ef1234567890";

function mockDb() {
  return {
    roomStatus: { upsert: jest.fn().mockResolvedValue({ room_status_id: ROOM_STATUS_ID }) },
    cleaningHistory: { upsert: jest.fn() },
  } as any;
}

const BOOKING = {
  booking_id: BOOKING_ID,
  guest_id: "b1b2c3d4-e5f6-4890-abcd-ef1234567890",
  hotel_id: HOTEL_ID,
  room_type_id: "d1b2c3d4-e5f6-4890-abcd-ef1234567890",
  check_in: "2026-10-01",
  check_out: "2026-10-05",
  status: "confirmed",
  channel: "direct",
  total_amount: 25500,
};

describe("handleHousekeepingEvent", () => {
  beforeEach(() => {
    jest.spyOn(bookingClient, "fetchBooking").mockResolvedValue({ ...BOOKING });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should mark the room dirty and upsert a pending task on checkout.completed", async () => {
    const db = mockDb();

    await handleHousekeepingEvent(db, "checkout.completed", {
      booking_id: BOOKING_ID,
      physical_room_number: "101",
    });

    expect(db.roomStatus.upsert).toHaveBeenCalledWith({
      where: {
        hotel_id_room_number: { hotel_id: HOTEL_ID, room_number: "101" },
      },
      create: {
        hotel_id: HOTEL_ID,
        physical_room_id: null,
        room_number: "101",
        status: "dirty",
      },
      update: { status: "dirty" },
    });
    expect(db.cleaningHistory.upsert).toHaveBeenCalledWith({
      where: { booking_id: BOOKING_ID },
      create: {
        room_status_id: ROOM_STATUS_ID,
        booking_id: BOOKING_ID,
        hotel_id: HOTEL_ID,
        physical_room_id: null,
        room_number: "101",
        status: "pending",
      },
      update: {},
    });
  });

  it("should persist the physical room uuid when the checkout carries it", async () => {
    const db = mockDb();
    const physicalRoomId = "f1b2c3d4-e5f6-4890-abcd-ef1234567890";

    await handleHousekeepingEvent(db, "checkout.completed", {
      booking_id: BOOKING_ID,
      physical_room_number: "101",
      physical_room_id: physicalRoomId,
    });

    expect(db.roomStatus.upsert).toHaveBeenCalledWith({
      where: {
        hotel_id_room_number: { hotel_id: HOTEL_ID, room_number: "101" },
      },
      create: {
        hotel_id: HOTEL_ID,
        physical_room_id: physicalRoomId,
        room_number: "101",
        status: "dirty",
      },
      update: { status: "dirty", physical_room_id: physicalRoomId },
    });
    expect(db.cleaningHistory.upsert).toHaveBeenCalledWith({
      where: { booking_id: BOOKING_ID },
      create: expect.objectContaining({ physical_room_id: physicalRoomId }),
      update: {},
    });
  });

  it("should requeue (throw) when the booking cannot be resolved", async () => {
    jest
      .spyOn(bookingClient, "fetchBooking")
      .mockReset()
      .mockResolvedValue(null);
    const db = mockDb();

    await expect(
      handleHousekeepingEvent(db, "checkout.completed", {
        booking_id: BOOKING_ID,
        physical_room_number: "101",
      })
    ).rejects.toThrow();

    expect(db.roomStatus.upsert).not.toHaveBeenCalled();
    expect(db.cleaningHistory.upsert).not.toHaveBeenCalled();
  });

  it("should ignore unknown routing keys", async () => {
    const db = mockDb();

    await handleHousekeepingEvent(db, "booking.created", {
      booking_id: BOOKING_ID,
      physical_room_number: "101",
    } as any);

    expect(db.roomStatus.upsert).not.toHaveBeenCalled();
    expect(db.cleaningHistory.upsert).not.toHaveBeenCalled();
  });
});
