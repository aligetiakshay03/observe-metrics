/**
 * Export helpers: CSV serialization and a dependency-free PDF generator
 * (raw PDF 1.4 with built-in Helvetica — good enough for a monthly summary).
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(","));
  return lines.join("\n");
}

// ─── Minimal PDF writer ───────────────────────────────────────

interface PdfText { type: "text"; x: number; y: number; size: number; bold: boolean; value: string }
interface PdfLine { type: "line"; x1: number; y1: number; x2: number; y2: number; gray: number }
type PdfOp = PdfText | PdfLine;

/**
 * Builds a simple one-page (or multi-page) PDF from title + sections.
 * Coordinates are in "points from top", converted to PDF's bottom-up space.
 * Page: US Letter 612 x 792pt.
 */
export function buildMonthlySummaryPdf(opts: {
  title: string;
  subtitle: string;
  sections: { heading: string; rows: [string, string][] }[];
}): Buffer {
  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN = 56;
  const ops: PdfOp[] = [];

  let y = MARGIN;
  ops.push({ type: "text", x: MARGIN, y, size: 20, bold: true, value: opts.title });
  y += 24;
  ops.push({ type: "text", x: MARGIN, y, size: 11, bold: false, value: opts.subtitle });
  y += 12;
  ops.push({ type: "line", x1: MARGIN, y1: y, x2: PAGE_W - MARGIN, y2: y, gray: 0.75 });
  y += 24;

  for (const section of opts.sections) {
    if (y > PAGE_H - MARGIN - 40) break; // single-page summary for now
    ops.push({ type: "text", x: MARGIN, y, size: 13, bold: true, value: section.heading });
    y += 18;
    for (const [label, value] of section.rows) {
      ops.push({ type: "text", x: MARGIN, y, size: 10, bold: false, value: label });
      ops.push({ type: "text", x: PAGE_W - MARGIN - 160, y, size: 10, bold: true, value: value });
      y += 16;
    }
    y += 12;
  }

  // ── Assemble PDF objects ──
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const contentOps: string[] = [];
  for (const op of ops) {
    if (op.type === "text") {
      contentOps.push(
        `BT /${op.bold ? "F2" : "F1"} ${op.size} Tf 1 0 0 1 ${op.x.toFixed(2)} ${(PAGE_H - op.y).toFixed(2)} Tm (${esc(op.value)}) Tj ET`,
      );
    } else {
      contentOps.push(
        `${op.gray.toFixed(2)} G ${op.x1.toFixed(2)} ${(PAGE_H - op.y1).toFixed(2)} m ${op.x2.toFixed(2)} ${(PAGE_H - op.y2).toFixed(2)} l S`,
      );
    }
  }
  const stream = contentOps.join("\n");

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "binary");
}
