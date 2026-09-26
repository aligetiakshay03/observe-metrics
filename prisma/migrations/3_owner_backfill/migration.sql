-- The earliest admin of each workspace becomes its OWNER (new role added in 1_platform).
UPDATE "public"."memberships" m
SET "role" = 'OWNER'
WHERE m."id" IN (
  SELECT DISTINCT ON ("organizationId") "id"
  FROM "public"."memberships"
  WHERE "role" = 'ADMIN'
  ORDER BY "organizationId", "createdAt" ASC
);

-- Legacy "DEMO provider" connections are superseded by dedicated demo workspaces.
DELETE FROM "public"."provider_connections" WHERE "provider" = 'DEMO';
