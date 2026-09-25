import { prisma } from "@/lib/db";
import { ok, errors, handler } from "@/lib/api";
import { requireOrgContext, requireAdmin } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";

export const POST = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();
  if (!requireAdmin(ctx)) return errors.forbidden();

  const stripe = getStripe();
  if (!stripe) return errors.badRequest("Billing is not configured on this deployment");

  const sub = await prisma.subscription.findFirst({ where: { organizationId: ctx.org.id } });
  if (!sub) return errors.badRequest("No billing profile yet — subscribe to a plan first");

  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: appUrl + "/dashboard/billing",
  });
  return ok({ url: session.url });
});
