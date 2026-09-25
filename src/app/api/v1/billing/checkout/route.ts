import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, errors, handler } from "@/lib/api";
import { requireOrgContext, requireAdmin } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { PLANS } from "@/lib/plans";

const BodySchema = z.object({
  plan: z.enum(["STARTER", "GROWTH"]),
});

export const POST = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();
  if (!requireAdmin(ctx)) return errors.forbidden();

  const stripe = getStripe();
  if (!stripe) return errors.badRequest("Billing is not configured on this deployment");

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errors.badRequest("Invalid plan");

  const priceId =
    parsed.data.plan === "STARTER" ? process.env.STRIPE_PRICE_STARTER : process.env.STRIPE_PRICE_GROWTH;
  if (!priceId) {
    return errors.badRequest(
      "Stripe price ID for " + parsed.data.plan + " is not configured (STRIPE_PRICE_STARTER / STRIPE_PRICE_GROWTH)",
    );
  }

  let customerId: string | undefined;
  const sub = await prisma.subscription.findFirst({ where: { organizationId: ctx.org.id } });
  if (sub) customerId = sub.stripeCustomerId;

  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer: customerId,
    client_reference_id: ctx.org.id,
    subscription_data: { metadata: { organizationId: ctx.org.id, plan: parsed.data.plan } },
    success_url: appUrl + "/dashboard/billing?status=success",
    cancel_url: appUrl + "/dashboard/billing?status=canceled",
  });

  return ok({ url: session.url });
});
