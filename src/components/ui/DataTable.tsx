"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button, cx } from "./primitives";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Value used for sorting; omit to make the column unsortable. */
  sort?: (row: T) => number | string | null;
  numeric?: boolean;
  className?: string;
  /** Hide below this breakpoint to keep tables readable on small screens. */
  hideBelow?: "sm" | "md" | "lg";
}

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };

/**
 * Sortable, searchable, paginated table. Rows with `href` are keyboard and
 * mouse navigable. Wide tables scroll horizontally inside their card rather
 * than overflowing the page.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  href,
  initialSort,
  searchable,
  searchPlaceholder = "Search…",
  pageSize = 10,
  empty,
  caption,
  selectable,
  toolbar,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string;
  href?: (r: T) => string | null;
  initialSort?: { key: string; dir: "asc" | "desc" };
  searchable?: (r: T) => string;
  searchPlaceholder?: string;
  pageSize?: number;
  empty?: React.ReactNode;
  caption: string;
  selectable?: { selected: Set<string>; onToggle: (key: string) => void; max?: number };
  toolbar?: React.ReactNode;
}) {
  const router = useRouter();
  const [sort, setSort] = useState(initialSort ?? null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = needle && searchable ? rows.filter((r) => searchable(r).toLowerCase().includes(needle)) : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sort) {
        const get = col.sort;
        out = [...out].sort((a, b) => {
          const va = get(a);
          const vb = get(b);
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
          return sort.dir === "asc" ? c : -c;
        });
      }
    }
    return out;
  }, [rows, q, sort, columns, searchable]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize, current * pageSize + pageSize);

  const toggleSort = (key: string) => {
    setPage(0);
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  };

  return (
    <div className="min-w-0">
      {(searchable || toolbar) && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          {searchable && (
            <div className="relative w-full sm:w-64">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
              <input
                className="input h-8 pl-8"
                placeholder={searchPlaceholder}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                aria-label={searchPlaceholder}
              />
            </div>
          )}
          {toolbar}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className={cx("table", href && "table-hover")}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {selectable && <th className="w-8" aria-label="Select" />}
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={cx(c.numeric && "text-right", c.hideBelow && HIDE[c.hideBelow], c.className)}
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {c.sort ? (
                      <button type="button" onClick={() => toggleSort(c.key)} className={cx("inline-flex items-center gap-1 uppercase hover:text-fg", active && "text-fg")}>
                        {c.header}
                        {active ? sort!.dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} /> : null}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="h-auto whitespace-normal">
                  {empty ?? <p className="py-8 text-center text-sm text-muted">{q ? `No results for “${q}”.` : "No data for this period."}</p>}
                </td>
              </tr>
            ) : (
              visible.map((r) => {
                const k = rowKey(r);
                const link = href?.(r) ?? null;
                return (
                  <tr
                    key={k}
                    className={cx(link && "cursor-pointer")}
                    onClick={link ? (e) => {
                      if ((e.target as HTMLElement).closest("a,button,input")) return;
                      router.push(link);
                    } : undefined}
                  >
                    {selectable && (
                      <td className="w-8 pr-0">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                          checked={selectable.selected.has(k)}
                          disabled={!selectable.selected.has(k) && selectable.max != null && selectable.selected.size >= selectable.max}
                          onChange={() => selectable.onToggle(k)}
                          aria-label="Select row for comparison"
                        />
                      </td>
                    )}
                    {columns.map((c, i) => (
                      <td key={c.key} className={cx(c.numeric && "num", c.hideBelow && HIDE[c.hideBelow], c.className)}>
                        {i === 0 && link ? (
                          <a
                            href={link}
                            onClick={(e) => {
                              e.preventDefault();
                              router.push(link);
                            }}
                            className="outline-none hover:underline focus-visible:underline"
                          >
                            {c.cell(r)}
                          </a>
                        ) : (
                          c.cell(r)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > pageSize && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted">
          <span className="tabular-nums">
            {current * pageSize + 1}–{Math.min(filtered.length, (current + 1) * pageSize)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page" icon={<ChevronLeft size={14} />} />
            <Button size="sm" variant="ghost" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Next page" icon={<ChevronRight size={14} />} />
          </div>
        </div>
      )}
    </div>
  );
}
