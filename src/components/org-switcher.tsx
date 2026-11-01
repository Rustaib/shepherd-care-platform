"use client";
import { useTransition } from "react";
import { switchOrganisation } from "@/app/(app)/actions";

export function OrgSwitcher({ current, options }: { current: string; options: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  if (options.length < 2) return null;
  return (
    <select aria-label="Switch organisation" className="field py-1.5 text-sm" value={current} disabled={pending}
      onChange={(e) => start(() => switchOrganisation(e.target.value))}>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}
