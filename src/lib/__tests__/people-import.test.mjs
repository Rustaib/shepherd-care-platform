import assert from "node:assert/strict";
import { test } from "node:test";
import { parseParticipants, parseStaff, splitAddress, splitFullName, auDateToIso } from "../people-import.ts";

test("names, addresses and dates", () => {
  assert.deepEqual(splitFullName("Dylan Jamie Citizen"), { first: "Dylan Jamie", last: "Citizen" });
  assert.deepEqual(splitFullName("Omar AL Haddad"), { first: "Omar", last: "AL Haddad" });
  assert.deepEqual(splitAddress("unit 7/18-22 Example Street, Campbelltown NSW, Australia"),
    { address_line1: "unit 7/18-22 Example Street", address_line2: null, suburb: "Campbelltown", state: "NSW", postcode: null });
  assert.deepEqual(splitAddress("2 The Avenue, Hurstville NSW 2220, Australia").postcode, "2220");
  assert.equal(auDateToIso("29/08/1975"), "1975-08-29");
  assert.equal(auDateToIso("31/02/2000"), null);
});

const SHIFTCARE = `salutation,name,gender,address,dob,phone,mobile,email,carer,relation,area,ndia,reference_number,custom_field_1,client_types,plan_expiry_date,teams,status,client_id,created_at,updated_at,agreement_start_date,agreement_end_date,ndis_plan_start_date,ndis_plan_end_date
mr,Sam Example,male,"12 Test Street, Appin NSW, Australia",29/08/1975,"",0400000001,sam@example.com,Sam Example,"",01 Assistance,431000001,,,Plan Managed,,"",Active,111,06/06/2024,08/27/2026,,,01/07/2026,30/06/2027
mr,Org Placeholder,unspecified,"1 Main Road, Bardia NSW, Australia",01/01/2020,1300000000,"",office@example.com,Jo Example,Mother,01 Assistance,4050000000,,,Self Managed,,"",Inactive,222,05/03/2025,09/13/2025,,,,
`;
test("participant export from another system", () => {
  const { rows, errors, warnings } = parseParticipants(SHIFTCARE);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 2);
  const [a, b] = rows;
  assert.deepEqual([a.first_name, a.last_name, a.ndis_number, a.date_of_birth, a.phone, a.suburb, a.state, a.management_type, a.external_ref, a.emergency_contact_name],
    ["Sam", "Example", "431000001", "1975-08-29", "0400000001", "Appin", "NSW", "plan_managed", "111", null]);
  assert.deepEqual(a.plan, { start_date: "2026-07-01", end_date: "2027-06-30" });
  assert.equal(b.ndis_number, null); assert.match(warnings[0], /isn't 9 digits/);
  assert.deepEqual([b.emergency_contact_name, b.emergency_contact_relationship, b.status, b.management_type], ["Jo Example", "Mother", "inactive", "self_managed"]);
});
test("participant template layout", () => {
  const { rows } = parseParticipants("first_name,last_name,ndis_number,date_of_birth,address_line1,suburb,state,postcode,management_type\nAlex,Sample,430000002,2000-01-31,1 Road,Penrith,nsw,2750,NDIA managed\n");
  assert.deepEqual([rows[0].state, rows[0].postcode, rows[0].management_type, rows[0].date_of_birth], ["NSW", "2750", "ndia_managed", "2000-01-31"]);
  assert.match(parseParticipants("foo,bar\n1,2\n").errors[0], /names/);
});

const USERS = `user_id,salutation,name,gender,address,dob,email,phone,mobile,role,area,invited_by,last_login,last_rostered_date,created_at,updated_at,onboarding_status
1,mrs,Office Admin,female,"",05/06/2024,admin@example.com,"",+61400000000,admin,Default Casual,Admin,,,,,Active
2,mrs,Anita,female,,01/01/2000,anita@example.com,0280000000,2,staff,Default Casual,Admin,,,,,No access
3,ms,Pat Worker,female,,,PAT@example.com,,"",staff,Part time,Admin,,,,,Active
4,mr,No Email,male,,,,,,staff,Default Casual,Admin,,,,,Active
5,ms,Pat Again,female,,,pat@example.com,,,staff,Part time,Admin,,,,,Active
`;
test("staff export from another system", () => {
  const { rows, errors, warnings } = parseStaff(USERS);
  assert.equal(rows.length, 3); assert.equal(errors.length, 1); assert.equal(warnings.length, 1);
  assert.deepEqual(rows.map((r) => [r.email, r.role, r.employment_type, r.phone]), [
    ["admin@example.com", "admin", "casual", "+61400000000"], ["anita@example.com", "staff", "casual", "0280000000"], ["pat@example.com", "staff", "part_time", null]]);
});
