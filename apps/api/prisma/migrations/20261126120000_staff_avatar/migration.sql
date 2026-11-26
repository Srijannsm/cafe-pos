-- Staff profile photos
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
