/**
 * Stripe integration for ObserveMetrics' own subscription plans.
 * Gracefully disabled when STRIPE_SECRET_KEY is not configured (dev/staging).
 */
import Stripe from "stripe";

const globalForStripe = globalThis as unknown as { __omStripe?: Stripe | null };

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (globalForStripe.__omStripe !== undefined) return globalForStripe.__omStripe;
  globalForStripe.__omStripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
  });
  return globalForStripe.__omStripe;
}

export const STRIPE_PRICE_ENV: Record<"STARTER" | "GROWTH", string | undefined> = {
  STARTER: process.env.STRIPE_PRICE_STARTER,
  GROWTH: process.env.STRIPE_PRICE_GROWTH,
};

export function billingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
