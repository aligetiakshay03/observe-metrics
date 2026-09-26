import "server-only";
import { prisma } from "../db";

export function slugify(input: string): string {
  return (
    input
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  );
}

export function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Resolve team / application references (slug or display name) to ids,
 * creating them on first sight — instrumented apps don't need to be
 * registered before sending events. Caches per call.
 */
export class DimensionResolver {
  private teams = new Map<string, string>();
  private apps = new Map<string, string>();

  constructor(private workspaceId: string) {}

  async team(ref: string | null | undefined): Promise<string | null> {
    if (!ref) return null;
    const slug = slugify(ref);
    const hit = this.teams.get(slug);
    if (hit) return hit;
    const name = ref.includes(" ") || /[A-Z]/.test(ref) ? ref.trim().slice(0, 80) : titleFromSlug(slug);
    const team = await prisma.team.upsert({
      where: { workspaceId_slug: { workspaceId: this.workspaceId, slug } },
      create: { workspaceId: this.workspaceId, slug, name },
      update: {},
      select: { id: true },
    });
    this.teams.set(slug, team.id);
    return team.id;
  }

  async application(ref: string | null | undefined, teamId: string | null): Promise<string | null> {
    if (!ref) return null;
    const slug = slugify(ref);
    const hit = this.apps.get(slug);
    if (hit) return hit;
    const name = ref.includes(" ") || /[A-Z]/.test(ref) ? ref.trim().slice(0, 80) : titleFromSlug(slug);
    const app = await prisma.application.upsert({
      where: { workspaceId_slug: { workspaceId: this.workspaceId, slug } },
      create: { workspaceId: this.workspaceId, slug, name, teamId },
      update: {},
      select: { id: true, teamId: true },
    });
    if (!app.teamId && teamId) await prisma.application.update({ where: { id: app.id }, data: { teamId } });
    this.apps.set(slug, app.id);
    return app.id;
  }
}
