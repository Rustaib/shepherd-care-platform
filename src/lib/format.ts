export function formatShiftRange(startIso: string, endIso: string, timeZone: string) {
  const day = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone });
  const time = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", timeZone });
  const s = new Date(startIso), e = new Date(endIso);
  return { day: day.format(s), time: `${time.format(s)} – ${time.format(e)}` };
}

export function hoursBetween(startIso: string, endIso: string, breakMinutes = 0) {
  return Math.max(0, (new Date(endIso).getTime() - new Date(startIso).getTime()) / 36e5 - breakMinutes / 60);
}
