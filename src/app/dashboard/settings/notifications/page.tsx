"use client";

import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/api-client";
import { Button, Card, ErrorState, Notice, Switch } from "@/components/ui/primitives";
import { useToast } from "@/components/providers/Toaster";
import { useMe } from "@/components/shell/MeProvider";
import { errMsg, SettingsSkeleton } from "../_components/common";

interface Prefs {
  inApp: { costAnomaly: boolean; budget: boolean; providerSync: boolean; performance: boolean; optimization: boolean };
  email: { budget: boolean; critical: boolean };
}

const IN_APP: { key: keyof Prefs["inApp"]; label: string; description: string }[] = [
  { key: "costAnomaly", label: "Cost anomalies", description: "Spend or usage rising well above its baseline." },
  { key: "budget", label: "Budget thresholds", description: "A budget crosses one of its alert thresholds." },
  { key: "providerSync", label: "Provider sync problems", description: "A provider connection fails to sync." },
  { key: "performance", label: "Latency and error spikes", description: "Latency regressions, error spikes and provider incidents." },
  { key: "optimization", label: "New optimization insights", description: "Opportunities to reduce spend, such as oversized context or duplicate requests." },
];

export default function NotificationSettings() {
  const { data, error, loading, refresh } = useApi<{ prefs: Prefs }>("/api/v1/me/notifications");
  const { me } = useMe();
  const toast = useToast();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setPrefs(data.prefs);
  }, [data]);

  if (loading && !data) return <SettingsSkeleton rows={2} />;
  if (error && !data) return <div className="card"><ErrorState message={error.message} onRetry={refresh} /></div>;
  if (!data || !prefs) return null;

  const dirty = JSON.stringify(prefs) !== JSON.stringify(data.prefs);
  const save = async () => {
    setSaving(true);
    try {
      await api("/api/v1/me/notifications", { method: "PUT", body: prefs });
      await refresh();
      toast({ tone: "success", title: "Notification preferences saved" });
    } catch (e) {
      toast({ tone: "error", title: "Couldn't save preferences", body: errMsg(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted">These preferences apply to you in <span className="font-medium text-fg">{me.workspace?.name}</span>.</p>
      <Card title="In-app notifications" subtitle="Shown in the notification center (bell icon).">
        <div className="divide-y divide-border">
          {IN_APP.map((i) => (
            <Switch
              key={i.key}
              label={i.label}
              description={i.description}
              checked={prefs.inApp[i.key]}
              onChange={(v) => setPrefs({ ...prefs, inApp: { ...prefs.inApp, [i.key]: v } })}
            />
          ))}
        </div>
      </Card>
      <Card title="Email" subtitle="Sent to your account email for the most important events.">
        {!me.features.smtp && (
          <div className="mb-3">
            <Notice tone="info">Email delivery isn&apos;t configured on this deployment (SMTP), so emails are not sent. Your preferences are still saved.</Notice>
          </div>
        )}
        <div className="divide-y divide-border">
          <Switch label="Budget alerts" description="When a budget reaches a threshold." checked={prefs.email.budget} onChange={(v) => setPrefs({ ...prefs, email: { ...prefs.email, budget: v } })} />
          <Switch label="Critical alerts" description="Critical cost anomalies, latency regressions and error spikes." checked={prefs.email.critical} onChange={(v) => setPrefs({ ...prefs, email: { ...prefs.email, critical: v } })} />
        </div>
      </Card>
      <div className="flex justify-end gap-2">
        <Button disabled={!dirty || saving} onClick={() => setPrefs(data.prefs)}>Reset</Button>
        <Button variant="primary" loading={saving} disabled={!dirty} onClick={save}>Save preferences</Button>
      </div>
    </div>
  );
}
