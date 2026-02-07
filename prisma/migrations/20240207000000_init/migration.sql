-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "title" VARCHAR(48) NOT NULL,
    "owner_id" UUID NOT NULL,
    "backup_video" TEXT NOT NULL DEFAULT '',
    "backup_video_timestamp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "backup_player_state" JSONB NOT NULL DEFAULT '{"mode":"youtube","url":"","status":"paused"}',
    "backup_chat_history" TEXT NOT NULL DEFAULT '{}',
    "access_mode" VARCHAR(20) NOT NULL DEFAULT 'public',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_members" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_members_room_id_user_id_key" ON "room_members"("room_id", "user_id");

-- AddForeignKey
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
