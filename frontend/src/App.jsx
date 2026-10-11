import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { Avatar, Bar, StackChips } from "./ui.jsx";
import { MeetingForm, PersonForm, ReviewForm, TaskForm, TeamForm } from "./forms.jsx";
import {
  DAYS, MAX, MEET_MIN, REVIEW_AREAS, STATUSES, addMin, fmtDate, level, memberProgress, nextMeeting,
  shortDate, sortMembers, statusOf, statusRank, weekStart, ymd,
} from "./lib.js";

const EMPTY = { members: [], tasks: [], meetings: [], reviews: [], settings: {} };
const CHILDREN = ["tasks", "meetings", "reviews"];
const REFRESH_MS = 30000;
const UNDO_MS = 6000;

function readLocal(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

export default function App() {
  const [data, setData] = useState(EMPTY);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [saveState, setSaveState] = useState("saved"); // saved | saving | error
  const [sel, setSel] = useState(null);
  const [tab, setTabState] = useState(() => readLocal("tab", "tasks"));
  const [showGuide, setShowGuide] = useState(() => readLocal("guideDismissed", "") !== "1");
  const [modal, setModal] = useState(null); // { kind, item }
  const [toast, setToast] = useState(null); // { msg, undo? }
  const panelRef = useRef(null);
  const inFlight = useRef(0);
  const pendingDeletes = useRef(new Map()); // "col/id" -> { timer, commit }

  // Hide items whose delete is waiting out the undo window.
  const withoutPending = useCallback((d) => {
    const hidden = pendingDeletes.current;
    if (!hidden.size) return d;
    const gone = (col, x) => hidden.has(`${col}/${x.id}`) || (col !== "members" && hidden.has(`members/${x.memberId}`));
    const out = { ...d };
    for (const col of ["members", ...CHILDREN]) out[col] = d[col].filter((x) => !gone(col, x));
    return out;
  }, []);

  const load = useCallback(async () => {
    if (!api.configured) { setStatus("error"); return; }
    try {
      const d = await api.getAll();
      if (inFlight.current === 0) setData(withoutPending({ ...EMPTY, ...d }));
      setStatus("ready");
    } catch {
      setStatus((s) => (s === "ready" ? s : "error"));
    }
  }, [withoutPending]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    window.addEventListener("focus", load);
    // Send any deletes still in their undo window before the page goes away.
    const flush = () => { for (const p of pendingDeletes.current.values()) { clearTimeout(p.timer); p.commit(); } pendingDeletes.current.clear(); };
    window.addEventListener("pagehide", flush);
    return () => { clearInterval(id); window.removeEventListener("focus", load); window.removeEventListener("pagehide", flush); };
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.undo ? UNDO_MS : 3000);
    return () => clearTimeout(id);
  }, [toast]);

  async function sync(promise) {
    inFlight.current++;
    setSaveState("saving");
    try {
      await promise;
      inFlight.current--;
      if (inFlight.current === 0) setSaveState("saved");
    } catch (e) {
      inFlight.current--;
      setSaveState("error");
      setToast({ msg: e.message || "Couldn't save. Check your connection and try again." });
      await load();
    }
  }

  function save(col, id, body, label) {
    setData((d) => {
      const exists = d[col].some((x) => x.id === id);
      const row = { ...body, id };
      return { ...d, [col]: exists ? d[col].map((x) => (x.id === id ? row : x)) : [...d[col], row] };
    });
    sync(api.put(col, id, body));
    if (label) setToast({ msg: `${label} saved` });
  }

  function remove(col, id, label) {
    const key = `${col}/${id}`;
    let removed = null;
    setData((d) => {
      removed = { item: d[col].find((x) => x.id === id), children: {} };
      const next = { ...d, [col]: d[col].filter((x) => x.id !== id) };
      if (col === "members") for (const c of CHILDREN) {
        removed.children[c] = d[c].filter((x) => x.memberId === id);
        next[c] = d[c].filter((x) => x.memberId !== id);
      }
      return next;
    });
    const commit = () => { pendingDeletes.current.delete(key); sync(api.remove(col, id)); };
    const timer = setTimeout(commit, UNDO_MS);
    pendingDeletes.current.set(key, { timer, commit });
    setToast({
      msg: `${label} deleted`,
      undo: () => {
        const p = pendingDeletes.current.get(key);
        if (!p) return;
        clearTimeout(p.timer);
        pendingDeletes.current.delete(key);
        if (!removed?.item) return;
        setData((d) => {
          const next = { ...d, [col]: [...d[col], removed.item] };
          for (const [c, rows] of Object.entries(removed.children)) next[c] = [...d[c], ...rows];
          return next;
        });
        if (col === "members") setSel(id);
        setToast({ msg: `${label} restored` });
      },
    });
  }

  function saveSettings(settings) {
    setData((d) => ({ ...d, settings }));
    sync(api.put("settings", "team", settings));
    setToast({ msg: "Team details saved" });
  }

  function quickUpdateTask(task, patch) {
    let { status: st, progress } = { status: task.status, progress: +task.progress || 0, ...patch };
    progress = Math.max(0, Math.min(100, progress));
    if (patch.status === "done") progress = 100;
    else if (patch.status && task.status === "done" && progress === 100) progress = 90;
    else if (patch.progress !== undefined) {
      if (progress === 100 && st !== "review") st = "done";
      else if (progress < 100 && st === "done") st = "doing";
      else if (progress > 0 && st === "todo") st = "doing";
    }
    const { id, ...rest } = task;
    save("tasks", id, { ...rest, status: st, progress, updated: ymd(new Date()) });
  }

  function setTab(t) { setTabState(t); writeLocal("tab", t); }
  function dismissGuide() { setShowGuide(false); writeLocal("guideDismissed", "1"); }

  const members = useMemo(() => sortMembers(data.members), [data.members]);
  const selId = members.find((m) => m.id === sel) ? sel : members[0]?.id || null;
  const selected = members.find((m) => m.id === selId);

  function openPerson(id, t) {
    setSel(id);
    if (t) setTab(t);
    if (t || window.innerWidth < 900) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (status === "loading") return <div className="state">Loading your team…</div>;
  if (status === "error")
    return (
      <div className="state">
        <h2>Can't reach the server</h2>
        <p>{api.configured ? "Check your internet connection, then try again." : "The API address isn't set. Build the app with VITE_API_URL."}</p>
        <button className="btn primary" type="button" onClick={() => { setStatus("loading"); load(); }}>Try again</button>
      </div>
    );

  const close = () => setModal(null);

  return (
    <div className="wrap">
      <Header settings={data.settings} saveState={saveState} onEdit={() => setModal({ kind: "team" })} />
      {showGuide && <Guide onDismiss={dismissGuide} />}
      <Kpis data={data} members={members} />
      <Week members={members} meetings={data.meetings} onOpen={(id) => openPerson(id, "meetings")} />

      <section className="main">
        <Roster
          members={members}
          tasks={data.tasks}
          selId={selId}
          onSelect={(id) => openPerson(id)}
          onAdd={() => setModal({ kind: "person" })}
        />
        <div className="panel" ref={panelRef}>
          {selected ? (
            <PersonPanel
              m={selected}
              data={data}
              tab={tab}
              setTab={setTab}
              open={(kind, item) => setModal({ kind, item })}
              onQuickUpdate={quickUpdateTask}
            />
          ) : (
            <div className="blank">
              <h3>No one on the team yet</h3>
              <p>Add up to five direct reports. For each person you can track tasks, log weekly 30‑minute 1:1s, and write an annual review.</p>
              <button className="btn primary" type="button" onClick={() => setModal({ kind: "person" })}>Add first person</button>
            </div>
          )}
        </div>
      </section>

      {modal?.kind === "team" && <TeamForm settings={data.settings} onSave={saveSettings} onClose={close} />}
      {modal?.kind === "person" && (
        <PersonForm
          member={modal.item}
          members={members}
          onSave={(id, body) => { save("members", id, body, body.name); setSel(id); }}
          onDelete={(id) => remove("members", id, modal.item?.name || "Person")}
          onClose={close}
        />
      )}
      {modal?.kind === "task" && (
        <TaskForm member={selected} task={modal.item}
          onSave={(id, b) => save("tasks", id, b, "Task")} onDelete={(id) => remove("tasks", id, "Task")} onClose={close} />
      )}
      {modal?.kind === "meeting" && (
        <MeetingForm member={selected} meeting={modal.item} tasks={data.tasks} meetings={data.meetings}
          onSave={(id, b) => save("meetings", id, b, "1:1 notes")} onDelete={(id) => remove("meetings", id, "1:1 log")} onClose={close} />
      )}
      {modal?.kind === "review" && (
        <ReviewForm member={selected} review={modal.item} reviews={data.reviews} tasks={data.tasks}
          onSave={(id, b) => save("reviews", id, b, "Review")} onDelete={(id) => remove("reviews", id, "Review")} onClose={close} />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.msg}</span>
          {toast.undo && <button type="button" onClick={toast.undo}>Undo</button>}
        </div>
      )}
    </div>
  );
}

function Header({ settings, saveState, onEdit }) {
  const saveText = { saved: "All changes saved", saving: "Saving…", error: "Last change didn't save" }[saveState];
  return (
    <header className="top">
      <div style={{ display: "grid", gap: 4 }}>
        <span className="eyebrow">Engineering team · weekly 1:1s</span>
        <h1>{settings.teamName || "A Team Orbit"}</h1>
        <div className="sup muted">
          Supervisor: <strong style={{ color: "var(--fg)" }}>{settings.supervisor || "Not set"}</strong>
          <button className="btn sm" type="button" onClick={onEdit}>Edit team</button>
          <span className={`savestate ${saveState}`} aria-live="polite">{saveText}</span>
        </div>
      </div>
      <div className="legend" aria-label="Progress colors">
        <span><i style={{ background: "var(--bad)" }} />0–24% at risk</span>
        <span><i style={{ background: "var(--warn)" }} />25–59% underway</span>
        <span><i style={{ background: "var(--info)" }} />60–99% on track</span>
        <span><i style={{ background: "var(--good)" }} />100% done</span>
      </div>
    </header>
  );
}

function Guide({ onDismiss }) {
  return (
    <section className="guide" aria-labelledby="guideTitle">
      <div className="guide-head">
        <h2 id="guideTitle">Getting started</h2>
        <button className="btn sm" type="button" onClick={onDismiss}>Got it</button>
      </div>
      <ol>
        <li><strong>Set up your team.</strong> Add up to five people and pick each person's weekly 30‑minute 1:1 slot. The example people are there to show how it works. Edit or remove them.</li>
        <li><strong>Track their work.</strong> Add tasks with the tech stack, issues and obstacles. Update status and progress right on the task card.</li>
        <li><strong>Run your 1:1s.</strong> Click a slot in "This week's 1:1s" or "Log 1:1". The form shows open tasks and last week's action items so you can prep. Once a year, fill in the annual review.</li>
      </ol>
    </section>
  );
}

function Kpis({ data, members }) {
  const ids = new Set(members.map((m) => m.id));
  const tasks = data.tasks.filter((t) => ids.has(t.memberId));
  const avg = members.length ? members.reduce((a, m) => a + memberProgress(data.tasks, m.id), 0) / members.length : 0;
  const open = tasks.filter((t) => t.status !== "done");
  const overdue = open.filter((t) => dueState(t) === "over").length;
  const ws = weekStart(), we = new Date(ws); we.setDate(we.getDate() + 6);
  const logged = new Set(data.meetings.filter((m) => m.date >= ymd(ws) && m.date <= ymd(we) && ids.has(m.memberId)).map((m) => m.memberId));
  const scheduled = members.filter((m) => m.meetingDay).length;
  return (
    <section className="kpis" aria-label="Team summary">
      <div className="kpi"><span className="eyebrow">Team progress</span><b>{members.length ? Math.round(avg) + "%" : "–"}</b>
        <div className={`bar lvl-${level(avg)}`}><i style={{ width: `${avg}%` }} /></div></div>
      <div className="kpi"><span className="eyebrow">Open tasks</span><b>{open.length}</b>
        <span className="muted">{overdue ? <span style={{ color: "var(--bad)" }}>{overdue} overdue · </span> : null}{tasks.length - open.length} done of {tasks.length}</span></div>
      <div className="kpi"><span className="eyebrow">Blocked</span><b>{tasks.filter((t) => t.status === "blocked").length}</b><span className="muted">tasks with obstacles</span></div>
      <div className="kpi"><span className="eyebrow">1:1s this week</span><b>{logged.size} / {scheduled}</b>
        <span className="muted">logged · {String((scheduled * MEET_MIN) / 60).replace(/\.0$/, "")} h of 1:1s, 30 min each</span></div>
    </section>
  );
}

function Week({ members, meetings, onOpen }) {
  const ws = weekStart();
  const fri = new Date(ws); fri.setDate(fri.getDate() + 4);
  const sun = new Date(ws); sun.setDate(sun.getDate() + 6);
  const logged = new Set(meetings.filter((m) => m.date >= ymd(ws) && m.date <= ymd(sun)).map((m) => m.memberId));
  const today = ymd(new Date());
  return (
    <section className="week" aria-labelledby="weekTitle">
      <div className="week-head"><h2 id="weekTitle">This week's 1:1s</h2><span className="muted mono">{shortDate(ws)} – {shortDate(fri)}</span></div>
      <div className="days">
        {DAYS.map((dn, i) => {
          const d = new Date(ws); d.setDate(d.getDate() + i);
          const slots = members.filter((m) => +m.meetingDay === i + 1).sort((a, b) => (a.meetingTime || "").localeCompare(b.meetingTime || ""));
          return (
            <div key={dn} className={`day${ymd(d) === today ? " today" : ""}`}>
              <div className="dname"><span>{dn}{ymd(d) === today ? " · today" : ""}</span><span className="mono">{d.getDate()}</span></div>
              {slots.length ? slots.map((m) => (
                <button key={m.id} type="button" className={`slot${logged.has(m.id) ? " done" : ""}`} onClick={() => onOpen(m.id)}
                  title={logged.has(m.id) ? "Open 1:1 notes" : "Open to log this 1:1"}>
                  <span className="t">{m.meetingTime}–{addMin(m.meetingTime, MEET_MIN)}</span>
                  <span className="who"><span>{m.name}</span></span>
                </button>
              )) : <span className="muted" style={{ fontSize: 12 }}>No 1:1s</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Roster({ members, tasks, selId, onSelect, onAdd }) {
  const left = MAX - members.length;
  return (
    <div className="roster">
      <div className="roster-head"><h2>Direct reports</h2><span className="muted num">{members.length} / {MAX}</span></div>
      {members.map((m) => {
        const t = tasks.filter((x) => x.memberId === m.id);
        const blocked = t.filter((x) => x.status === "blocked").length;
        const overdue = t.filter((x) => x.status !== "done" && dueState(x) === "over").length;
        const nm = nextMeeting(m);
        return (
          <button key={m.id} type="button" className="person" aria-current={m.id === selId} onClick={() => onSelect(m.id)}>
            <div className="prow"><Avatar name={m.name} />
              <div style={{ minWidth: 0 }}><div className="pname">{m.name}</div><div className="ptitle">{m.title}</div></div></div>
            <Bar p={memberProgress(tasks, m.id)} />
            <div className="pmeta">
              <span>
                {t.filter((x) => x.status !== "done").length} open
                {blocked ? <> · <span style={{ color: "var(--bad)" }}>{blocked} blocked</span></> : null}
                {overdue ? <> · <span style={{ color: "var(--bad)" }}>{overdue} overdue</span></> : null}
              </span>
              <span className="mono">{nm ? `${DAYS[m.meetingDay - 1]} ${m.meetingTime}` : "No 1:1 set"}</span>
            </div>
          </button>
        );
      })}
      {left > 0 && (
        <button type="button" className="empty-slot" onClick={onAdd}>+ Add person ({left} open spot{left > 1 ? "s" : ""})</button>
      )}
    </div>
  );
}

function PersonPanel({ m, data, tab, setTab, open, onQuickUpdate }) {
  const nm = nextMeeting(m);
  const counts = {
    tasks: data.tasks.filter((t) => t.memberId === m.id).length,
    meetings: data.meetings.filter((t) => t.memberId === m.id).length,
    reviews: data.reviews.filter((t) => t.memberId === m.id).length,
  };
  const tabs = [["tasks", "Tasks"], ["meetings", "1:1 meetings"], ["reviews", "Annual review"]];
  return (
    <>
      <div className="phead">
        <Avatar name={m.name} large />
        <div className="grow"><h2>{m.name}</h2><div className="muted">{m.title}</div><StackChips stack={m.stack} /></div>
        <div style={{ display: "grid", gap: 6, minWidth: 200 }}>
          <span className="eyebrow">Weekly 1:1 · 30 min</span>
          <span className="mono">{m.meetingDay ? `${DAYS[m.meetingDay - 1]} ${m.meetingTime}–${addMin(m.meetingTime, MEET_MIN)}` : "Not scheduled"}</span>
          <span className="muted" style={{ fontSize: 12 }}>{nm ? "Next: " + nm.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : ""}</span>
          <div className="head-actions">
            <button className="btn sm primary" type="button" onClick={() => { setTab("meetings"); open("meeting"); }}>Log 1:1</button>
            <button className="btn sm" type="button" onClick={() => open("person", m)}>Edit person</button>
          </div>
        </div>
        <div style={{ flexBasis: "100%" }}><Bar p={memberProgress(data.tasks, m.id)} /></div>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} className="tab" role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l} <span className="muted num">{counts[k]}</span>
          </button>
        ))}
      </div>
      <div className="pbody">
        {tab === "tasks" && <TasksTab m={m} tasks={data.tasks} open={open} onQuickUpdate={onQuickUpdate} />}
        {tab === "meetings" && <MeetingsTab m={m} meetings={data.meetings} open={open} />}
        {tab === "reviews" && <ReviewsTab m={m} reviews={data.reviews} open={open} />}
      </div>
    </>
  );
}

function dueState(t) {
  if (!t.due || t.status === "done") return "";
  const today = ymd(new Date());
  if (t.due < today) return "over";
  const soon = new Date(); soon.setDate(soon.getDate() + 3);
  return t.due <= ymd(soon) ? "soon" : "";
}

function DueLabel({ t }) {
  if (!t.due) return null;
  const s = dueState(t);
  const text = s === "over" ? `Overdue · was due ${t.due}` : s === "soon" ? `Due soon · ${t.due}` : `Due ${t.due}`;
  return <span className={`due ${s}`}>{text}</span>;
}

function TasksTab({ m, tasks, open, onQuickUpdate }) {
  const list = tasks
    .filter((x) => x.memberId === m.id)
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || String(a.due || "9").localeCompare(String(b.due || "9")));
  return (
    <>
      <div className="toolbar"><span className="muted">Change status and progress right on a card. Click a card to edit everything.</span>
        <button className="btn primary" type="button" onClick={() => open("task")}>+ Add task</button></div>
      {!list.length && <div className="blank">No tasks yet. Add what {m.name.split(" ")[0]} is working on, the tech stack, and any issues or obstacles.</div>}
      {list.map((x) => {
        const s = statusOf(x.status);
        const p = +x.progress || 0;
        return (
          <div key={x.id} className="task" onClick={(e) => { if (!e.target.closest("button,select")) open("task", x); }}>
            <div className="item-top">
              <button type="button" className="title-btn" onClick={() => open("task", x)}><h3>{x.title}</h3></button>
              <select aria-label={`Status of ${x.title}`} className={`chip ${s[2]}`} value={x.status} onChange={(e) => onQuickUpdate(x, { status: e.target.value })}>
                {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="quick">
              <button type="button" className="step" disabled={p <= 0} aria-label="Decrease progress by 10%" onClick={() => onQuickUpdate(x, { progress: p - 10 })}>−10</button>
              <Bar p={p} />
              <button type="button" className="step" disabled={p >= 100} aria-label="Increase progress by 10%" onClick={() => onQuickUpdate(x, { progress: p + 10 })}>+10</button>
            </div>
            <div className="item-top"><StackChips stack={x.stack} /><DueLabel t={x} /></div>
            {x.issue && <div className="flag issue"><b>Issue:</b> {x.issue}</div>}
            {x.obstacles && <div className="flag obst"><b>Obstacle:</b> {x.obstacles}</div>}
          </div>
        );
      })}
    </>
  );
}

function MeetingsTab({ m, meetings, open }) {
  const list = meetings.filter((x) => x.memberId === m.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return (
    <>
      <div className="toolbar"><span className="muted">Every 1:1 is a 30‑minute slot.</span>
        <button className="btn primary" type="button" onClick={() => open("meeting")}>+ Log 1:1</button></div>
      {!list.length && <div className="blank">No 1:1s logged yet. After each weekly meeting, record what was discussed and your notes.</div>}
      {list.map((x) => (
        <button key={x.id} type="button" className="item" onClick={() => open("meeting", x)}>
          <div className="item-top"><h3>{fmtDate(x.date)}</h3><span className="mono muted">{x.time}–{addMin(x.time, MEET_MIN)} · 30 min</span></div>
          <dl className="kv">
            {x.discussed && <><dt>Discussed</dt><dd>{x.discussed}</dd></>}
            {x.update && <><dt>Their update</dt><dd>{x.update}</dd></>}
            {x.blockers && <><dt>Issues raised</dt><dd>{x.blockers}</dd></>}
            {x.actions && <><dt>Action items</dt><dd>{x.actions}</dd></>}
          </dl>
          {x.supNotes && <div className="note-sup"><span className="eyebrow">Supervisor note</span>{"\n"}{x.supNotes}</div>}
        </button>
      ))}
    </>
  );
}

function ReviewsTab({ m, reviews, open }) {
  const list = reviews.filter((x) => x.memberId === m.id).sort((a, b) => (b.year || 0) - (a.year || 0));
  return (
    <>
      <div className="toolbar"><span className="muted">One review per year. Save as draft until it's final.</span>
        <button className="btn primary" type="button" onClick={() => open("review")}>+ Start annual review</button></div>
      {!list.length && <div className="blank">No annual reviews yet.</div>}
      {list.map((x) => {
        const r = x.ratings || {};
        const vals = REVIEW_AREAS.map(([k]) => +r[k] || 0).filter(Boolean);
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        return (
          <button key={x.id} type="button" className="item" onClick={() => open("review", x)}>
            <div className="item-top"><h3>{x.year} annual review</h3>
              <span className={`chip ${x.status === "final" ? "st-good" : "st-warn"}`}>{x.status === "final" ? "Final" : "Draft"}</span></div>
            <div className="rating-row">{REVIEW_AREAS.map(([k, l]) => <span key={k}>{l} <span className="score">{r[k] || "–"}/5</span></span>)}</div>
            <div className="rating-row"><strong>{x.overall || "No overall rating"}</strong>{avg ? <span className="muted mono">avg {avg.toFixed(1)}/5</span> : null}</div>
            {x.achievements && (
              <dl className="kv"><dt>Achievements</dt><dd>{x.achievements}</dd>{x.goals && <><dt>Next year</dt><dd>{x.goals}</dd></>}</dl>
            )}
          </button>
        );
      })}
    </>
  );
}
