import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runShiftReminders } from "@/lib/reminders";
import { createServiceClient } from "@/lib/supabase/server";

// Called hourly by the Worker's cron trigger (see worker.ts).
export async function GET(request: NextRequest) {
  const secret = env.cronSecret();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const force = request.nextUrl.searchParams.get("force") === "1";
  const summary = await runShiftReminders(createServiceClient(), { force });
  return NextResponse.json({ ok: true, summary });
}
