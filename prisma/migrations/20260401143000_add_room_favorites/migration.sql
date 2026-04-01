CREATE TABLE "room_favorites" (
    "user_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_favorites_pkey" PRIMARY KEY ("user_id", "room_id")
);

CREATE INDEX "room_favorites_user_id_created_at_idx" ON "room_favorites"("user_id", "created_at");
CREATE INDEX "room_favorites_room_id_idx" ON "room_favorites"("room_id");

ALTER TABLE "room_favorites"
ADD CONSTRAINT "room_favorites_room_id_fkey"
FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
