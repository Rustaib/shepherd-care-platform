/** Incident categories used on the incident form.
 *
 *  "Reportable" categories follow the NDIS (Incident Management and Reportable
 *  Incidents) Rules 2018 and must be notified to the NDIS Quality and Safeguards
 *  Commission: within 24 hours of key personnel becoming aware, except an
 *  unauthorised restrictive practice that caused no harm (5 business days).
 *  The remaining categories are recorded and managed internally. */

export type IncidentCategory = {
  value: string;
  label: string;
  reportable: boolean;
  /** Notification deadline for reportable incidents. */
  notifyWithin?: "24_hours" | "5_business_days";
  hint?: string;
};

export const INCIDENT_CATEGORIES: IncidentCategory[] = [
  // Reportable to the NDIS Commission
  { value: "death", label: "Death of a participant", reportable: true, notifyWithin: "24_hours" },
  { value: "serious_injury", label: "Serious injury", reportable: true, notifyWithin: "24_hours",
    hint: "e.g. fracture, burns, head injury, injury needing emergency treatment or hospital admission" },
  { value: "abuse_neglect", label: "Abuse or neglect", reportable: true, notifyWithin: "24_hours" },
  { value: "unlawful_contact_assault", label: "Unlawful sexual or physical contact, or assault", reportable: true, notifyWithin: "24_hours" },
  { value: "sexual_misconduct", label: "Sexual misconduct", reportable: true, notifyWithin: "24_hours" },
  { value: "restrictive_practice_harm", label: "Unauthorised restrictive practice (harm caused)", reportable: true, notifyWithin: "24_hours" },
  { value: "restrictive_practice_no_harm", label: "Unauthorised restrictive practice (no harm)", reportable: true, notifyWithin: "5_business_days" },
  // Internal incidents
  { value: "minor_injury", label: "Minor injury", reportable: false },
  { value: "fall", label: "Fall (no serious injury)", reportable: false },
  { value: "medication", label: "Medication error or refusal", reportable: false },
  { value: "behaviour", label: "Behaviour of concern", reportable: false },
  { value: "health", label: "Illness or health concern", reportable: false },
  { value: "missing_person", label: "Missing person / absconding", reportable: false },
  { value: "property", label: "Property damage or loss", reportable: false },
  { value: "staff_injury", label: "Staff injury or WHS hazard", reportable: false },
  { value: "complaint", label: "Complaint or feedback", reportable: false },
  { value: "near_miss", label: "Near miss", reportable: false },
  { value: "other", label: "Other", reportable: false },
];

export const categoryByValue = (v: string) => INCIDENT_CATEGORIES.find((c) => c.value === v);
