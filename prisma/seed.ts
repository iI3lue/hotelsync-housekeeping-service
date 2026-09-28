import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding housekeeping database...");

  // Servicio event-driven: rooms y tasks nacen de `checkout.completed`.
  // Seed opcional: hotel demo para dejar habitaciones iniciales vía
  // SEED_HOTEL_ID (UUID de Property) con números separados por coma en
  // SEED_ROOM_NUMBERS (ej. "101,102,201").
  const hotelId = process.env.SEED_HOTEL_ID;
  const roomNumbers = (process.env.SEED_ROOM_NUMBERS ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  if (hotelId && roomNumbers.length > 0) {
    for (const roomNumber of roomNumbers) {
      await prisma.roomStatus.upsert({
        where: { hotel_id_room_number: { hotel_id: hotelId, room_number: roomNumber } },
        create: { hotel_id: hotelId, room_number: roomNumber, status: "clean" },
        update: {},
      });
    }
    console.log(`Seeded ${roomNumbers.length} rooms for hotel ${hotelId}.`);
  } else {
    console.log("No SEED_HOTEL_ID/SEED_ROOM_NUMBERS provided, skipping demo rooms.");
  }

  console.log("Seed completed successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
