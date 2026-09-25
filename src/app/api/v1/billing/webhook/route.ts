import { prisma } from "@/lib/db";
import { handler } from "@/lib/api";
import { getStripe } from "@/lib/stripe";
import type Stripe from "stripe";

export const POST = handler(async (req) => {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response("Billing not configured", { status: 400 });

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (e) {
    return new Response("Invalid signature: " + (e as Error).message, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.client_reference_id ?? session.metadata?.organizationId;
      const plan = (session.metadata?.plan as "STARTER" | "GROWTH" | undefined) ?? "STARTER";
      if (session.subscription && orgId) {
        const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string);
        await upsertSubscription(orgId, stripeSub, plan);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const stripeSub = event.data.object as Stripe.Subscription;
      const orgId = stripeSub.metadata?.organizationId;
      if (orgId) {
        await upsertSubscription(
          orgId,
          stripeSub,
          (stripeSub.metadata?.plan as "STARTER" | "GROWTH" | undefined) ?? "STARTER",
        );
        if (stripeSub.status !== "active" && stripeSub.status !== "trialing") {
          await prisma.organization.update({ where: { id: orgId }, data: { plan: "FREE" } });
        }
      }
      break;
    }
    default:
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

async function upsertSubscription(
  organizationId: string,
  stripeSub: Stripe.Subscription,
  plan: "STARTER" | "GROWTH",
) {
  const item = stripeSub.items.data[0] as unknown as
    | { current_period_start?: number; current_period_end?: number }
    | undefined;
  await prisma.$transaction([
    prisma.subscription.upsert({
      where: { stripeSubscriptionId: stripeSub.id },
      create: {
        organizationId,
        stripeCustomerId: typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id,
        stripeSubscriptionId: stripeSub.id,
        plan,
        status: stripeSub.status,
        currentPeriodStart: item?.current_period_start ? new Date(item.current_period_start * 1000) : null,
        currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      },
      update: {
        plan,
        status: stripeSub.status,
        currentPeriodStart: item?.current_period_start ? new Date(item.current_period_start * 1000) : null,
        currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      },
    }),
    prisma.organization.update({
      where: { id: organizationId },
      data: {
        plan: stripeSub.status === "active" || stripeSub.status === "trialing" ? plan : "FREE",
      },
    }),
  ]);
}

export const dynamic = "force-dynamic";
