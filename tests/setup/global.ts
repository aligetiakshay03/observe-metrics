/**
 * Vitest global setup: points Prisma at an isolated test database and applies
 * migrations. Override with TEST_DATABASE_URL.
 */
import { execSync } from "child_process";

export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:55432/observe_metrics_test?schema=public";
  process.env.DATABASE_URL = url;
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
