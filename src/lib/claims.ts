export const EXPENSE_CATEGORIES = [
  { value: "participant_activity", label: "Participant activity / entry fees" },
  { value: "transport", label: "Parking, tolls or public transport" },
  { value: "meals", label: "Meals (participant support)" },
  { value: "supplies", label: "Supplies or consumables" },
  { value: "other", label: "Other" },
];
export const expenseLabel = (v: string) => EXPENSE_CATEGORIES.find((c) => c.value === v)?.label ?? v;

export const CLAIM_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-accent/15 text-ink" },
  approved: { label: "Approved", cls: "bg-success/10 text-success" },
  rejected: { label: "Rejected", cls: "bg-danger/10 text-danger" },
};

export const RECEIPT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf",
};
