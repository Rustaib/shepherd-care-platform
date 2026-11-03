/** CSV exports of billed supports for accounting systems and NDIA bulk claims.
 *  Pure functions: rows in, CSV text out. */

export type ExportCustomer = {
  name: string; first_name?: string; last_name?: string; email: string | null; ndis_number: string | null;
  address_line1?: string | null; address_line2?: string | null; suburb?: string | null; state?: string | null; postcode?: string | null;
};

export type ExportRow = {
  customer: ExportCustomer;
  invoiceNumber: string | null;
  issueDate: string | null;   // yyyy-MM-dd
  dueDate: string | null;
  serviceDate: string;        // yyyy-MM-dd
  serviceDateTo?: string | null; // last day covered (bulk weekly/monthly charges)
  kind: "service" | "travel" | "charge";
  description: string;
  code: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type ExportSettings = { ndiaRegistrationNumber: string | null; abn: string | null; accountCode: string; taxType: string };

export const FORMATS = {
  ndia: { label: "NDIA bulk payment request", file: "ndia-bulk-claim" },
  quickbooks: { label: "QuickBooks (ShiftCare-style, as your sample)", file: "quickbooks-invoices" },
  qbo: { label: "QuickBooks Online (standard invoice import)", file: "quickbooks-online-invoices" },
  xero: { label: "Xero (sales invoice import)", file: "xero-invoices" },
  myob: { label: "MYOB AccountRight (service sales import)", file: "myob-service-sales" },
} as const;
export type ExportFormat = keyof typeof FORMATS;

const au = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const n2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const n1 = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(Math.round(n * 100) / 100));

function cell(v: string | number | null | undefined) {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  // Neutralise spreadsheet formulas, then quote if needed
  const s = /^[=+@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = (header: string[], rows: (string | number | null | undefined)[][]) =>
  [header.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\r\n") + "\r\n";

/** Provider travel (…_799_…) is claimed in dollars: quantity = amount, unit price = 1. */
const claimQtyPrice = (r: ExportRow) => (r.kind === "travel" ? { qty: r.amount, price: 1 } : { qty: r.quantity, price: r.unitPrice });

export function toCsv(format: ExportFormat, rows: ExportRow[], s: ExportSettings): string {
  const sorted = [...rows].sort((a, b) =>
    (a.invoiceNumber ?? "").localeCompare(b.invoiceNumber ?? "") || a.customer.name.localeCompare(b.customer.name) || a.serviceDate.localeCompare(b.serviceDate));

  if (format === "ndia") {
    const header = ["RegistrationNumber", "NDISNumber", "SupportsDeliveredFrom", "SupportsDeliveredTo", "SupportNumber", "ClaimReference",
      "Quantity", "Hours", "UnitPrice", "GSTCode", "AuthorisedBy", "ParticipantApproved", "InKindFundingProgram", "ClaimType", "CancellationReason", "ABN of Support Provider"];
    return csv(header, sorted.map((r) => {
      const { qty, price } = claimQtyPrice(r);
      return [s.ndiaRegistrationNumber ?? "", r.customer.ndis_number ?? "", r.serviceDate, r.serviceDateTo ?? r.serviceDate, r.code ?? "", r.invoiceNumber ?? "",
        n1(qty), "", n2(price), "P2", "", "", "", "", "", (s.abn ?? "").replace(/\s/g, "")];
    }));
  }

  if (format === "quickbooks") {
    const header = ["*Customer", "EmailAddress", "POAddressLine1", "POAddressLine2", "POAddressLine3", "POAddressLine4", "POCity", "PORegion",
      "POPostalCode", "POCountry", "*InvoiceNo", "Reference", "*InvoiceDate", "*DueDate", "ServiceDate", "InventoryItemCode", "*Description",
      "*Quantity", "*UnitAmount", "Discount", "*AccountCode", "*TaxType", "TrackingName1", "TrackingOption1", "TrackingName2", "TrackingOption2",
      "Currency", "BrandingTheme", "*ItemAmount"];
    return csv(header, sorted.map((r) => {
      const c = r.customer, { qty, price } = claimQtyPrice(r);
      return [c.name, c.email ?? "", "", "", c.address_line2 ?? "", c.address_line1 ?? "", c.suburb ?? "", c.state ?? "", c.postcode ?? "", "Australia",
        r.invoiceNumber ?? "", `${c.ndis_number ?? ""}:`, au(r.issueDate), au(r.dueDate), au(r.serviceDate), "", r.description,
        n1(qty), n2(price), "", s.accountCode, s.taxType, "", "", "", "", "", "Standard", n2(r.amount)];
    }));
  }

  if (format === "xero") {
    const header = ["*ContactName", "EmailAddress", "POAddressLine1", "POAddressLine2", "POAddressLine3", "POAddressLine4", "POCity", "PORegion",
      "POPostalCode", "POCountry", "*InvoiceNumber", "Reference", "*InvoiceDate", "*DueDate", "InventoryItemCode", "*Description", "*Quantity",
      "*UnitAmount", "Discount", "*AccountCode", "*TaxType", "TrackingName1", "TrackingOption1", "TrackingName2", "TrackingOption2", "Currency", "BrandingTheme"];
    return csv(header, sorted.map((r) => {
      const c = r.customer;
      return [c.name, c.email ?? "", c.address_line1 ?? "", c.address_line2 ?? "", "", "", c.suburb ?? "", c.state ?? "", c.postcode ?? "", "Australia",
        r.invoiceNumber ?? "", c.ndis_number ?? "", au(r.issueDate), au(r.dueDate), "", r.description, n2(r.quantity), n2(r.unitPrice), "",
        s.accountCode, s.taxType, "", "", "", "", "", ""];
    }));
  }

  if (format === "qbo") {
    const header = ["InvoiceNo", "Customer", "InvoiceDate", "DueDate", "Terms", "Memo", "Item(Product/Service)", "ItemDescription",
      "ItemQuantity", "ItemRate", "ItemAmount", "ItemTaxCode", "ServiceDate"];
    return csv(header, sorted.map((r) => [r.invoiceNumber ?? "", r.customer.name, au(r.issueDate), au(r.dueDate), "",
      r.customer.ndis_number ? `NDIS ${r.customer.ndis_number}` : "", r.code ?? "NDIS support", r.description,
      n2(r.quantity), n2(r.unitPrice), n2(r.amount), "FRE", au(r.serviceDate)]));
  }

  // MYOB AccountRight service sales: one row per line, blank row between invoices
  const header = ["Co./Last Name", "First Name", "Addr 1 - Line 1", "           - Line 2", "           - Line 3", "Invoice #", "Date",
    "Customer PO", "Description", "Account #", "Amount", "Inc-Tax Amount", "Tax Code", "Non-GST Amount", "GST Amount", "Sale Status", "Journal Memo"];
  const out: (string | number)[][] = [];
  let last: string | null = null;
  for (const r of sorted) {
    if (last !== null && r.invoiceNumber !== last) out.push([]);
    last = r.invoiceNumber;
    const c = r.customer;
    const detail = r.kind === "travel" ? "" : ` (${n2(r.quantity)} ${r.unit === "Hours" ? "h" : r.unit} @ $${n2(r.unitPrice)})`;
    out.push([c.last_name ?? c.name, c.first_name ?? "", c.address_line1 ?? "", c.address_line2 ?? "",
      [c.suburb, c.state, c.postcode].filter(Boolean).join(" "), r.invoiceNumber ?? "", au(r.issueDate), c.ndis_number ?? "",
      `${r.description}${detail}`, s.accountCode, n2(r.amount), n2(r.amount), "FRE", n2(r.amount), "0.00", "I", `Invoice ${r.invoiceNumber ?? ""}`]);
  }
  return [header.join(","), ...out.map((r) => r.map(cell).join(","))].join("\r\n") + "\r\n";
}
