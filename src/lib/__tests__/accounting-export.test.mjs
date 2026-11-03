import assert from "node:assert/strict";
import { test } from "node:test";
import { toCsv } from "../accounting-export.ts";

const maram = { name: "Maram AL Zuhairi", first_name: "Maram", last_name: "AL Zuhairi", email: "zahrahbasima@gmail.com", ndis_number: "430200001",
  address_line1: "5 Lalich Avenue", address_line2: null, suburb: "Bonnyrigg", state: "NSW", postcode: "2177" };
const adam = { name: "Adam Randell", first_name: "Adam", last_name: "Randell", email: "adamranndell48@gmail.com", ndis_number: "431226546",
  address_line1: "12 Kerr Street", address_line2: null, suburb: "Appin", state: "NSW", postcode: "2560" };
const settings = { ndiaRegistrationNumber: "4050141668", abn: "19 638 477 540", accountCode: "100", taxType: "GST Free Income" };
const row = (c, date, desc, code, qty, price, kind = "service", inv = "10682761") => ({
  customer: c, invoiceNumber: inv, issueDate: "2026-10-27", dueDate: "2026-11-03", serviceDate: date, kind, description: desc, code,
  unit: kind === "travel" ? "km" : "Hours", quantity: qty, unitPrice: price, amount: Math.round(qty * price * 100) / 100,
});

test("NDIA bulk claim matches the sample header and row shape", () => {
  const out = toCsv("ndia", [row(maram, "2026-10-20", "x", "01_200_0115_1_1", 2, 73.58)], settings).split("\r\n");
  assert.equal(out[0], "RegistrationNumber,NDISNumber,SupportsDeliveredFrom,SupportsDeliveredTo,SupportNumber,ClaimReference,Quantity,Hours,UnitPrice,GSTCode,AuthorisedBy,ParticipantApproved,InKindFundingProgram,ClaimType,CancellationReason,ABN of Support Provider");
  assert.equal(out[1], "4050141668,430200001,2026-10-20,2026-10-20,01_200_0115_1_1,10682761,2.0,,73.58,P2,,,,,,19638477540");
});

test("QuickBooks export reproduces a line from the sample file", () => {
  const desc = "Adam Randell @ 19/10/2026 12:00 PM - 04:00 PM [04 Access Community Social And Rec Activ Standard] [04_104_0125_6_1]";
  const out = toCsv("quickbooks", [row(adam, "2026-10-19", desc, "04_104_0125_6_1", 4, 73.58, "service", "10682757")], settings).split("\r\n");
  assert.equal(out[0], "*Customer,EmailAddress,POAddressLine1,POAddressLine2,POAddressLine3,POAddressLine4,POCity,PORegion,POPostalCode,POCountry,*InvoiceNo,Reference,*InvoiceDate,*DueDate,ServiceDate,InventoryItemCode,*Description,*Quantity,*UnitAmount,Discount,*AccountCode,*TaxType,TrackingName1,TrackingOption1,TrackingName2,TrackingOption2,Currency,BrandingTheme,*ItemAmount");
  assert.equal(out[1], `Adam Randell,adamranndell48@gmail.com,,,,12 Kerr Street,Appin,NSW,2560,Australia,10682757,431226546:,27/10/2026,03/11/2026,19/10/2026,,${desc},4.0,73.58,,100,GST Free Income,,,,,,Standard,294.32`);
});

test("QuickBooks travel lines are claimed in dollars like the sample", () => {
  const out = toCsv("quickbooks", [row(adam, "2026-10-21", "Adam Randell @ … [01_799_0107_1_1] 33km $1.02/km", "01_799_0107_1_1", 33, 1.02, "travel")], settings).split("\r\n");
  assert.match(out[1], /,33\.66,1\.00,,100,GST Free Income,.*,Standard,33\.66$/);
});

test("Xero uses the standard template and km × rate", () => {
  const out = toCsv("xero", [row(adam, "2026-10-21", "trip", "01_799_0107_1_1", 33, 1.02, "travel")], settings).split("\r\n");
  assert.ok(out[0].startsWith("*ContactName,EmailAddress,POAddressLine1"));
  assert.match(out[1], /,trip,33\.00,1\.02,,100,GST Free Income,/);
});

test("MYOB separates invoices with a blank line", () => {
  const out = toCsv("myob", [row(adam, "2026-10-19", "a", "c", 1, 10, "service", "1"), row(maram, "2026-10-19", "b", "c", 1, 10, "service", "2")], settings).split("\r\n");
  assert.equal(out[2], "");
  assert.ok(out[1].startsWith("Randell,Adam,12 Kerr Street,,Appin NSW 2560,1,27/10/2026,431226546,a (1.00 h @ $10.00),100,10.00"));
});

test("descriptions with commas and quotes are escaped; formulas neutralised", () => {
  const out = toCsv("qbo", [row({ ...adam, name: '=HYPERLINK("x")' }, "2026-10-19", 'Shopping, "big" trip', "c", 1, 10)], settings).split("\r\n");
  assert.match(out[1], /"'=HYPERLINK\(""x""\)"/);
  assert.match(out[1], /"Shopping, ""big"" trip"/);
});
