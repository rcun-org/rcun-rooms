-- AlterTable
ALTER TABLE "rooms"
ADD COLUMN "lifecycle_status" VARCHAR(20) NOT NULL DEFAULT 'ready';

-- CreateTable
CREATE TABLE "room_messages" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "author_name" VARCHAR(50) NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_messages_room_id_created_at_idx" ON "room_messages"("room_id", "created_at");

-- AddForeignKey
ALTER TABLE "room_messages"
ADD CONSTRAINT "room_messages_room_id_fkey"
FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
