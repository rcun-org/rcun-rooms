CREATE TABLE "room_queue_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "video_url" TEXT NOT NULL,
    "poster" TEXT NOT NULL DEFAULT '',
    "kind" VARCHAR(32) NOT NULL DEFAULT 'Long',
    "duration" VARCHAR(64) NOT NULL DEFAULT 'Queued',
    "position" INTEGER NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_queue_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "room_queue_items_room_id_position_idx" ON "room_queue_items"("room_id", "position");

ALTER TABLE "room_queue_items"
ADD CONSTRAINT "room_queue_items_room_id_fkey"
FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
