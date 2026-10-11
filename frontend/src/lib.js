export const MAX = 5;
export const MEET_MIN = 30;
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
export const STATUSES = [
  ["todo", "Not started", "st-none"],
  ["doing", "In progress", "st-info"],
  ["blocked", "Blocked", "st-bad"],
  ["review", "In review", "st-warn"],
  ["done", "Done", "st-good"],
];
export const REVIEW_AREAS = [
  ["technical", "Technical skill"],
  ["delivery", "Delivery & quality"],
  ["communication", "Communication"],
  ["collaboration", "Teamwork"],
  ["initiative", "Ownership & initiative"],
];
export const OVERALL = ["Exceeds expectations", "Meets expectations", "Partially meets", "Below expectations"];

export const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const initials = (n) => (n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export const level = (p) => (p >= 100 ? "good" : p >= 60 ? "info" : p >= 25 ? "warn" : "bad");
export const stackList = (v) => (Array.isArray(v) ? v : String(v || "").split(",")).map((s) => s.trim()).filter(Boolean);
export const statusOf = (k) => STATUSES.find((s) => s[0] === k) || STATUSES[0];
export const statusRank = (k) => STATUSES.findIndex((s) => s[0] === k);

export const toMin = (t) => { const [h, m] = (t || "0:0").split(":").map(Number); return h * 60 + m; };
export const addMin = (t, m) => { const x = toMin(t || "00:00") + m; return String(Math.floor(x / 60) % 24).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0"); };
export const overlaps = (a, b) => Math.abs(toMin(a) - toMin(b)) < MEET_MIN;

export const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export const fmtDate = (s) => (s ? new Date(s + "T00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "");
export const shortDate = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function weekStart() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function memberProgress(tasks, id) {
  const t = tasks.filter((x) => x.memberId === id);
  return t.length ? t.reduce((a, x) => a + (+x.progress || 0), 0) / t.length : 0;
}

export function nextMeeting(m) {
  if (!m.meetingDay) return null;
  const now = new Date(), ws = weekStart();
  const [h, mm] = (m.meetingTime || "09:00").split(":").map(Number);
  for (let w = 0; w < 2; w++) {
    const d = new Date(ws); d.setDate(d.getDate() + w * 7 + (m.meetingDay - 1));
    d.setHours(h, mm + MEET_MIN, 0, 0);
    if (d > now) { d.setHours(h, mm); return d; }
  }
  return null;
}

export const sortMembers = (a) =>
  [...a].sort((x, y) => (x.order ?? 0) - (y.order ?? 0) || String(x.name).localeCompare(y.name));
