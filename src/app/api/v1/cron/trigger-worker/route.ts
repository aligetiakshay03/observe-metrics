import { errors, handler } from "@/lib/api";
import { runAllTicks } from "@/lib/queue";

export const POST = handler(async (req) => {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET ? "Bearer " + process.env.CRON_SECRET : null;
  if (expected && auth !== expected) return errors.unauthorized();

  const result = await runAllTicks();
  return new Response(JSON.stringify({ success: true, data: result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

export const dynamic = "force-dynamic";
