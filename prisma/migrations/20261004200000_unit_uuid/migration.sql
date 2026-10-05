-- AlterTable
ALTER TABLE "room_status" ADD COLUMN "physical_room_id" UUID;

-- AlterTable
ALTER TABLE "cleaning_history" ADD COLUMN "physical_room_id" UUID;
