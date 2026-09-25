"use client";

import { useState } from "react";
import { ProvidersSection } from "./ProvidersSection";
import { TeamSection } from "./TeamSection";
import { OrgSection } from "./OrgSection";

const TABS = ["Providers", "Team", "Organization"] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("Providers");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm muted">Provider connections, team members, and organization preferences.</p>
      </div>
      <div className="mb-6 flex gap-1 rounded-lg border p-1" style={{ borderColor: "var(--border)", width: "fit-content" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="rounded-md px-4 py-1.5 text-sm"
            style={tab === t ? { background: "var(--accent)", color: "#fff" } : undefined}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Providers" && <ProvidersSection />}
      {tab === "Team" && <TeamSection />}
      {tab === "Organization" && <OrgSection />}
    </div>
  );
}
