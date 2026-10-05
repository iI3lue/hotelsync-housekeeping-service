-- AlterTable
ALTER TABLE "cleaning_history" ADD COLUMN "assigned_to_user_id" UUID,
ADD COLUMN "completed_by_user_id" UUID,
ADD COLUMN "completed_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "cleaning_history_assigned_to_user_id_idx" ON "cleaning_history"("assigned_to_user_id");
