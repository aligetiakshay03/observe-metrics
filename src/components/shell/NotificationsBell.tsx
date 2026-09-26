"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useEffect } from "react";
import { api, useApi } from "@/lib/api-client";
import { fmtRelative } from "@/lib/format";
import type { NotificationItem } from "@/lib/types";
import { Button, cx, Spinner } from "../ui/primitives";
import { Popover } from "../ui/overlay";

/** Notification center: per-user, per-workspace, with read/unread state. */
export function NotificationsBell() {
  const { data, loading, error, refresh, mutate } = useApi<{ notifications: NotificationItem[]; unread: number }>("/api/v1/notifications");

  useEffect(() => {
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const markRead = async (ids?: string[]) => {
    if (data) {
      const now = new Date().toISOString();
      mutate({
        notifications: data.notifications.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)),
        unread: ids ? Math.max(0, data.unread - ids.filter((id) => !data.notifications.find((n) => n.id === id)?.readAt).length) : 0,
      });
    }
    try {
      await api("/api/v1/notifications/read", { body: ids ? { ids } : {} });
    } finally {
      void refresh();
    }
  };

  const unread = data?.unread ?? 0;
  return (
    <Popover
      label="Notifications"
      width="w-[min(360px,calc(100vw-24px))]"
      trigger={({ toggle, ref, ...aria }) => (
        <Button ref={ref} variant="ghost" onClick={toggle} {...aria} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative" icon={<Bell size={17} />}>
          {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-bg" aria-hidden />}
        </Button>
      )}
    >
      {(close) => (
        <div className="-m-1">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button className="inline-flex items-center gap-1 text-xs font-medium text-accent" onClick={() => void markRead()}>
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {loading && (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            )}
            {error && <p className="px-3 py-6 text-center text-sm text-danger">{error.message}</p>}
            {data && data.notifications.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted">You&apos;re all caught up. Alerts, budget thresholds and new insights will appear here.</p>
            )}
            {data?.notifications.map((n) => (
              <Link
                key={n.id}
                href={n.href ?? "/dashboard/alerts"}
                role="menuitem"
                onClick={() => {
                  close();
                  if (!n.readAt) void markRead([n.id]);
                }}
                className={cx("flex gap-2.5 border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-surface-2", !n.readAt && "bg-accent-soft/40")}
              >
                <span className={cx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-snug">{n.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>
                  <span className="mt-1 block text-2xs text-faint">
                    {fmtRelative(n.createdAt)}
                    {!n.readAt && <span className="sr-only"> · unread</span>}
                  </span>
                </span>
              </Link>
            ))}
          </div>
          <div className="border-t border-border px-3 py-2 text-center">
            <Link href="/dashboard/alerts" onClick={close} className="text-xs font-medium text-accent">
              View all alerts
            </Link>
          </div>
        </div>
      )}
    </Popover>
  );
}
