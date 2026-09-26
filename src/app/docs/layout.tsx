import type { Metadata } from "next";
import { getServerAuth } from "@/server/auth/server";
import { SiteFooter, SiteHeader } from "../_landing/SiteHeader";
import { DocsNav } from "./DocsNav";

export const metadata: Metadata = {
  title: { default: "Documentation", template: "%s · ObserveMetrics Docs" },
  description: "How ObserveMetrics collects AI usage, connects providers, ingests events and protects your credentials.",
};
export const dynamic = "force-dynamic";

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const auth = await getServerAuth().catch(() => null);
  return (
    <div className="min-h-screen overflow-x-hidden">
      <SiteHeader authed={!!auth && !auth.user.isGuest} />
      <div className="mx-auto flex max-w-[1200px] gap-12 px-4 py-10 sm:px-6">
        <DocsNav />
        <main id="main" className="min-w-0 flex-1">
          <article className="prose-docs">{children}</article>
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
