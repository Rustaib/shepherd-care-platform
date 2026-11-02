import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ShiftAppointment = { id: string; title: string; starts_at: string; ends_at: string | null; location: string | null; notes: string | null; shift_id: string | null };

/** Appointments that belong to a shift: explicitly linked to it, or for the
 *  shift's participant, unlinked, and starting during the shift (from an hour
 *  before it starts). */
export async function shiftAppointments(
  supabase: SupabaseClient,
  shift: { id: string; participant_id: string | null; starts_at: string; ends_at: string },
): Promise<ShiftAppointment[]> {
  const cols = "id,title,starts_at,ends_at,location,notes,shift_id";
  const windowStart = new Date(Date.parse(shift.starts_at) - 36e5).toISOString();
  const [{ data: linked }, { data: during }] = await Promise.all([
    supabase.from("appointments").select(cols).eq("shift_id", shift.id),
    shift.participant_id
      ? supabase.from("appointments").select(cols).eq("participant_id", shift.participant_id).is("shift_id", null)
          .gte("starts_at", windowStart).lt("starts_at", shift.ends_at)
      : Promise.resolve({ data: [] as ShiftAppointment[] }),
  ]);
  const all = new Map<string, ShiftAppointment>();
  for (const a of [...(linked ?? []), ...(during ?? [])] as ShiftAppointment[]) all.set(a.id, a);
  return [...all.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

export const directionsUrl = (place: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`;
