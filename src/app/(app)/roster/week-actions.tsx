"use client";
import { useState, useTransition } from "react";
import { copyPreviousWeek, publishWeek } from "./actions";

export function WeekActions({ monday, drafts }: { monday: string; drafts: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-ghost" disabled={pending} onClick={() => {
        if (!confirm("Copy last week's shifts into this week as drafts?")) return;
        start(async () => {
          const r = await copyPreviousWeek(monday);
          setMsg(r.copied || r.skipped
            ? `Copied ${r.copied} shift${r.copied === 1 ? "" : "s"} as drafts${r.skipped ? `, skipped ${r.skipped} that would double-book someone` : ""}.`
            : "Last week had no shifts to copy.");
        });
      }}>Copy last week</button>
      {drafts > 0 && (
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => { await publishWeek(monday); setMsg(`Published ${drafts} shift${drafts === 1 ? "" : "s"}.`); })}>
          Publish {drafts} draft{drafts === 1 ? "" : "s"}
        </button>
      )}
      {msg && <p className="w-full text-sm text-muted" role="status">{msg}</p>}
    </div>
  );
}
