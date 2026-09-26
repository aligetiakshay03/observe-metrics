import type { Metadata } from "next";

export const metadata: Metadata = { title: "Live demo", robots: { index: false } };

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
