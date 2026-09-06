/* ============================================================
   Crafty Central — formatting

   Carried over from ui.js unchanged in behaviour. Dates are ISO
   strings parsed with an explicit T00:00:00 so a shoot day never
   slides backwards across a timezone boundary. Money and clock
   formats stay en-CA, as they were.
   ============================================================ */

const D = (isoStr: string) => new Date(isoStr + "T00:00:00");

export const fmtShort = (isoStr: string) =>
  D(isoStr).toLocaleDateString("en-CA", { month: "short", day: "numeric" });

export const fmtLong = (isoStr: string) =>
  D(isoStr).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });

export const fmtFull = (isoStr: string) =>
  D(isoStr).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });

export const fmtRange = (a: string, b: string) =>
  a === b ? fmtShort(a) : `${fmtShort(a)} – ${fmtShort(b)}`;

export function fmtDays(days: string[]): string {
  if (!days || !days.length) return "—";
  return days.length === 1
    ? fmtLong(days[0])
    : `${fmtShort(days[0])} – ${fmtShort(days[days.length - 1])} · ${days.length} days`;
}

export const fmtMoney = (n: number) =>
  "$" + n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtTime12(t: string | number | null | undefined): string {
  if (!t) return "—";
  const [h, m] = String(t).split(":").map(Number);
  if (Number.isNaN(h)) return "—";
  const ap = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${ap}`;
}

export const fmtClock = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });

export function fmtAgo(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

export const firstName = (name: string) => (name || "").split(" ")[0];

export const initials = (name: string) =>
  (name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/* Deterministic avatar colour — same person, same colour, on every
   device, because it is derived from the id rather than assigned. */
export const AVATAR_COLORS = [
  "#34688c", "#2a7d84", "#5a6e8c", "#a3824f", "#a05c6e",
  "#6b8c7a", "#4f7d78", "#8c7a5a", "#446e63",
];

export function avatarColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export const STATUS_LABELS: Record<string, string> = { estimate: "Hold" };

export const statusLabel = (s: string) =>
  STATUS_LABELS[s] || s.charAt(0).toUpperCase() + s.slice(1);
