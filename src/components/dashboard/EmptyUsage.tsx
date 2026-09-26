"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FlaskConical, Plug } from "lucide-react";
import { Button, ButtonLink, EmptyState } from "../ui/primitives";
import { api, clearApiCache } from "@/lib/api-client";
import { useToast } from "../providers/Toaster";
import { useMe } from "../shell/MeProvider";

/** Shown when a real workspace has no usage yet: guide to connect or explore the demo. */
export function EmptyUsage({ title = "No AI usage yet", body }: { title?: string; body?: string }) {
  const router = useRouter();
  const toast = useToast();
  const { can } = useMe();
  const [busy, setBusy] = useState(false);
  const demo = async () => {
    setBusy(true);
    try {
      await api("/api/v1/demo/start", { body: {} });
      clearApiCache();
      window.location.assign("/dashboard");
    } catch (e) {
      toast({ tone: "error", title: "Couldn't open the demo", body: (e as Error).message });
      setBusy(false);
    }
  };
  return (
    <div className="card">
      <EmptyState
        icon={<Plug size={18} />}
        title={title}
        body={body ?? "Connect your first provider or send events from your application to start tracking AI spend, tokens and performance."}
        actions={
          <>
            {can("ADMIN") && (
              <ButtonLink href="/dashboard/settings/providers" variant="primary" icon={<Plug size={14} />}>
                Connect provider
              </ButtonLink>
            )}
            <Button onClick={demo} loading={busy} icon={<FlaskConical size={14} />}>
              Explore demo
            </Button>
            <ButtonLink href="/docs/sdk" variant="ghost">
              Instrument an app
            </ButtonLink>
          </>
        }
      />
    </div>
  );
}
