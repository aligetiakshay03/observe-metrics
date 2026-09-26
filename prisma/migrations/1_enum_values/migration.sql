-- New enum values must be committed before later migrations can use them.
ALTER TYPE "public"."member_role" ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE "public"."member_role" ADD VALUE IF NOT EXISTS 'VIEWER';
ALTER TYPE "public"."sync_status" ADD VALUE IF NOT EXISTS 'IDLE';
