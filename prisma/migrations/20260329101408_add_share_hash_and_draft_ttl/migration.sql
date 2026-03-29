-- AlterTable
ALTER TABLE "rooms"
ADD COLUMN "share_hash" VARCHAR(64),
ADD COLUMN "password_digest" VARCHAR(64) NOT NULL DEFAULT '',
ADD COLUMN "draft_expires_at" TIMESTAMP(3);

-- Backfill legacy rooms with stable share hashes before enforcing uniqueness.
UPDATE "rooms"
SET "share_hash" = md5("id"::text) || md5('room:' || "id"::text)
WHERE "share_hash" IS NULL;

ALTER TABLE "rooms"
ALTER COLUMN "share_hash" SET NOT NULL;

-- CreateTable
CREATE TABLE "room_share_links" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_share_links_pkey" PRIMARY KEY ("id")
);

-- Backfill aliases for legacy rooms.
INSERT INTO "room_share_links" ("id", "room_id", "hash")
SELECT "id", "id", "share_hash"
FROM "rooms";

-- CreateIndex
CREATE UNIQUE INDEX "rooms_share_hash_key" ON "rooms"("share_hash");

-- CreateIndex
CREATE UNIQUE INDEX "room_share_links_hash_key" ON "room_share_links"("hash");

-- CreateIndex
CREATE INDEX "room_share_links_room_id_idx" ON "room_share_links"("room_id");

-- AddForeignKey
ALTER TABLE "room_share_links"
ADD CONSTRAINT "room_share_links_room_id_fkey"
FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
