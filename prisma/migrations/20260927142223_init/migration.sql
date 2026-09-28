-- CreateTable
CREATE TABLE "room_status" (
    "room_status_id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "room_number" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'clean',
    "assigned_to" VARCHAR(100),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "room_status_pkey" PRIMARY KEY ("room_status_id")
);

-- CreateTable
CREATE TABLE "cleaning_history" (
    "history_id" UUID NOT NULL,
    "room_status_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "room_number" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "assigned_to" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cleaning_history_pkey" PRIMARY KEY ("history_id")
);

-- CreateIndex
CREATE INDEX "room_status_hotel_id_status_idx" ON "room_status"("hotel_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "room_status_hotel_id_room_number_key" ON "room_status"("hotel_id", "room_number");

-- CreateIndex
CREATE UNIQUE INDEX "cleaning_history_booking_id_key" ON "cleaning_history"("booking_id");

-- CreateIndex
CREATE INDEX "cleaning_history_hotel_id_status_idx" ON "cleaning_history"("hotel_id", "status");

-- CreateIndex
CREATE INDEX "cleaning_history_booking_id_idx" ON "cleaning_history"("booking_id");

-- AddForeignKey
ALTER TABLE "cleaning_history" ADD CONSTRAINT "cleaning_history_room_status_id_fkey" FOREIGN KEY ("room_status_id") REFERENCES "room_status"("room_status_id") ON DELETE CASCADE ON UPDATE CASCADE;
