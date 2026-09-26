"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Code sample with a copy button. */
export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="not-prose group relative mb-5 overflow-hidden rounded-lg border border-border bg-surface-2/60">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-2xs uppercase tracking-wide text-faint">{lang}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs text-muted hover:bg-surface-3 hover:text-fg"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard unavailable */
            }
          }}
          aria-label="Copy code"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-6">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
