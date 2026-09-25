import { prisma } from "@/lib/db";
import { ok, errors, handler } from "@/lib/api";
import { getCurrentUser, resolveActiveOrg } from "@/lib/auth";
import { planOf } from "@/lib/plans";
import { billingEnabled } from "@/lib/stripe";

export const GET = handler(async (req) => {
  const user = await getCurrentUser();
  if (!user) return errors.unauthorized();

  const url = new URL(req.url);
  const org = await resolveActiveOrg(user, url.searchParams.get("orgId"));
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { organization: { select: { id: true, name: true, slug: true, plan: true } } },
    orderBy: { createdAt: "asc" },
  });

  return ok({
    billingEnabled: billingEnabled(),
    user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
    organizations: memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      plan: m.organization.plan,
      role: m.role,
      team: m.team,
      limits: planOf(m.organization.plan),
    })),
    activeOrg: org ? { id: org.id, name: org.name, slug: org.slug, plan: org.plan } : null,
  });
});

export const dynamic = "force-dynamic";
