import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

export type InvoicePdfData = {
  title: string;                 // "Tax Invoice"
  number: string;
  issueDate: string;             // dd/MM/yyyy
  dueDate: string;
  periodLabel: string;           // "19/10/2026 – 25/10/2026"
  from: { name: string; lines: string[] };   // address, phone, email, ABN …
  to: { name: string; lines: string[] };
  meta: [string, string][];      // extra right-hand details, e.g. ["NDIS", "430178966"]
  lines: { description: string; unit: string; quantity: number; unitPrice: number; tax: number; amount: number }[];
  subtotal: number; tax: number; total: number;
  paymentDetails: string | null;
  footer: string | null;
  showTax: boolean;
  accent: string;                // brand colour, #rrggbb
  logo: { bytes: Uint8Array; type: "png" | "jpg" } | null;
};

const A4 = { w: 595.28, h: 841.89 };
const M = 40; // margin
const money = (n: number) => "$" + n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hex = (h: string) => {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const INK = rgb(0.11, 0.17, 0.2), MUTED = rgb(0.36, 0.4, 0.45), LINE = rgb(0.86, 0.88, 0.9);

/** Standard PDF fonts only cover Western European characters; replace the rest. */
function safe(font: PDFFont, text: string) {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    try { font.encodeText(ch); out += ch; } catch { out += ch.normalize("NFD").replace(/[̀-ͯ]/g, "") || "?"; }
  }
  return out.replace(/[^\x20-\xff–—‘’“”•€]/g, (c) => { try { font.encodeText(c); return c; } catch { return "?"; } });
}

function wrap(font: PDFFont, size: number, text: string, width: number): string[] {
  const out: string[] = [];
  for (const rawPara of text.replace(/\r\n?/g, "\n").split("\n")) {
    const para = safe(font, rawPara);
    let line = "";
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= width) { line = test; continue; }
      if (line) out.push(line);
      // very long word: hard-break
      let w = word;
      while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
        let i = w.length;
        while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
        out.push(w.slice(0, i)); w = w.slice(i);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

/** Render an invoice to PDF bytes. Pure: no network, works on Workers. */
export async function renderInvoicePdf(d: InvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${d.title} ${d.number}`);
  doc.setAuthor(d.from.name);
  doc.setCreator("Hoiva");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = hex(d.accent);
  let logo: PDFImage | null = null;
  if (d.logo) {
    try { logo = d.logo.type === "png" ? await doc.embedPng(d.logo.bytes) : await doc.embedJpg(d.logo.bytes); } catch { logo = null; }
  }

  const text = (p: PDFPage, s: string, x: number, y: number, size = 9, f = font, color = INK) =>
    p.drawText(safe(f, s), { x, y, size, font: f, color });
  const right = (p: PDFPage, s: string, xRight: number, y: number, size = 9, f = font, color = INK) =>
    text(p, s, xRight - f.widthOfTextAtSize(safe(f, s), size), y, size, f, color);

  // Table columns (x positions; numbers right-aligned to the column's right edge)
  const W = A4.w - 2 * M;
  const cols = d.showTax
    ? { desc: M, descW: W * 0.5, type: M + W * 0.53, qty: M + W * 0.69, rate: M + W * 0.8, tax: M + W * 0.89, cost: M + W }
    : { desc: M, descW: W * 0.58, type: M + W * 0.61, qty: M + W * 0.76, rate: M + W * 0.88, tax: 0, cost: M + W };

  const pages: PDFPage[] = [];
  const tableHeader = (p: PDFPage, y: number) => {
    p.drawRectangle({ x: M, y: y - 6, width: W, height: 20, color: accent, opacity: 0.1 });
    text(p, "Description", cols.desc + 4, y, 9, bold);
    text(p, "Type", cols.type, y, 9, bold);
    right(p, "Quantity", cols.qty, y, 9, bold);
    right(p, "Rate", cols.rate, y, 9, bold);
    if (d.showTax) right(p, "Tax", cols.tax, y, 9, bold);
    right(p, "Cost", cols.cost - 4, y, 9, bold);
    return y - 24;
  };
  const newPage = () => { const p = doc.addPage([A4.w, A4.h]); pages.push(p); return p; };

  // ---- First page header
  let page = newPage();
  let y = A4.h - M;
  let titleX = M;
  if (logo) {
    const h = 40, w = Math.min(140, (logo.width / logo.height) * h);
    const hh = (logo.height / logo.width) * w;
    page.drawImage(logo, { x: M, y: y - hh, width: w, height: hh });
    titleX = M + w + 12;
  }
  text(page, d.from.name, titleX, y - 26, 18, bold);
  y -= 52;
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 1, color: accent });
  y -= 22;

  // From / To / Invoice details
  const colW = W / 3 - 10;
  const block = (x: number, heading: string, name: string, lines: string[]) => {
    let yy = y;
    text(page, heading, x, yy, 8, bold, MUTED); yy -= 13;
    for (const l of wrap(bold, 9.5, name, colW)) { text(page, l, x, yy, 9.5, bold); yy -= 12; }
    for (const raw of lines) for (const l of wrap(font, 9, raw, colW)) { text(page, l, x, yy, 9); yy -= 12; }
    return yy;
  };
  const y1 = block(M, "FROM", d.from.name, d.from.lines);
  const y2 = block(M + W / 3, "TO", d.to.name, d.to.lines);
  let y3 = y;
  const metaX = M + (2 * W) / 3;
  text(page, `${d.title} #${d.number}`, metaX, y3, 11, bold, accent); y3 -= 15;
  for (const [k, v] of [["Issue date", d.issueDate], ["Payment due", d.dueDate], ["Period", d.periodLabel], ...d.meta] as [string, string][]) {
    text(page, `${k}:`, metaX, y3, 9, bold);
    text(page, v, metaX + bold.widthOfTextAtSize(`${k}: `, 9), y3, 9);
    y3 -= 12;
  }
  y = Math.min(y1, y2, y3) - 18;

  // ---- Line items
  y = tableHeader(page, y);
  for (const line of d.lines) {
    const descLines = wrap(font, 8.5, line.description, cols.descW - 8);
    const h = descLines.length * 11 + 10;
    if (y - h < M + 30) { page = newPage(); y = tableHeader(page, A4.h - M - 10); }
    let yy = y;
    descLines.forEach((l, i) => text(page, l, cols.desc + 4, yy - i * 11, 8.5));
    text(page, line.unit, cols.type, yy, 8.5);
    right(page, line.quantity.toFixed(2), cols.qty, yy, 8.5);
    right(page, money(line.unitPrice), cols.rate, yy, 8.5);
    if (d.showTax) right(page, money(line.tax), cols.tax, yy, 8.5);
    right(page, money(line.amount), cols.cost - 4, yy, 8.5);
    yy -= descLines.length * 11 - 3;
    page.drawLine({ start: { x: M, y: yy }, end: { x: M + W, y: yy }, thickness: 0.5, color: LINE });
    y = yy - 12;
  }

  // ---- Totals + payment details (keep together)
  const payLines = d.paymentDetails ? wrap(font, 9, d.paymentDetails, W / 2 - 20) : [];
  const need = Math.max(80, payLines.length * 12 + 30);
  if (y - need < M + 20) { page = newPage(); y = A4.h - M - 10; }
  y -= 6;
  const totX = M + W / 2 + 20;
  text(page, `Amount due ${d.dueDate}`, totX, y, 10, bold);
  let ty = y - 18;
  for (const [k, v] of [["Subtotal", d.subtotal], ["Tax", d.tax]] as [string, number][]) {
    text(page, k, totX, ty, 9.5); right(page, money(v), M + W - 4, ty, 9.5); ty -= 15;
  }
  page.drawLine({ start: { x: totX, y: ty + 9 }, end: { x: M + W, y: ty + 9 }, thickness: 0.8, color: INK });
  text(page, "Total", totX, ty - 4, 11, bold); right(page, money(d.total), M + W - 4, ty - 4, 11, bold, accent);
  if (payLines.length) {
    text(page, "Payment details", M, y, 10, bold);
    payLines.forEach((l, i) => text(page, l, M, y - 18 - i * 12, 9));
  }
  y = Math.min(ty - 4, y - 18 - payLines.length * 12) - 24;

  if (d.footer) {
    const fl = wrap(font, 8.5, d.footer, W);
    if (y - fl.length * 11 < M) { page = newPage(); y = A4.h - M - 10; }
    fl.forEach((l, i) => text(page, l, M, y - i * 11, 8.5, font, MUTED));
  }

  // Page numbers
  pages.forEach((p, i) => right(p, `${d.title} #${d.number} · Page ${i + 1} of ${pages.length}`, A4.w - M, 22, 7.5, font, MUTED));
  return doc.save();
}
