"use client";

import { useState } from "react";
import { ProvidersSection } from "./ProvidersSection";
import { TeamSection } from "./TeamSection";
import { OrgSection } from "./OrgSection";

const SECTIONS = ["Providers", "Team", "Workspace"] as const;
type Section = (typeof SECTIONS)[number];

const SUBTITLES: Record<Section, string> = {
  Providers: "Connect AI providers with encrypted API keys — sync every 6 hours.",
  Team: "Members, roles, and team tags for cost allocation.",
  Workspace: "Organization name, plan and limits.",
};

export default function SettingsPage() {
  const [section, setSection] = useState<Section>("Providers");

  return (
    <div>
      <SectionHeader title="Settings" subtitle={SUBTITLES[section]} />

      <div className="mb-5 flex gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--surface-2)", width: "fit-content" }}>
        {SECTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className="rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-all"
            style={section === s ? { background: "var(--surface)", color: "var(--text)", boxShadow: "var(--shadow-xs)" } : { color: "var(--muted)" }}
          >
            {s}
          </button>
        ))}
      </div>

      {section === "Providers" && <ProvidersSection />}
      {section === "Team" && <TeamSection />}
      {section === "Workspace" && <OrgSection />}
    </div>
  );
}

function SectionHeader(props: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-semibold tracking-tight">{props.title}</h1>
      <p className="mt-0.5 text-[13px] muted">{props.subtitle}</p>
    </div>
  );
}
