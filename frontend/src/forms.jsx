import { useState } from "react";
import { Modal } from "./ui.jsx";
import {
  DAYS, MAX, MEET_MIN, OVERALL, REVIEW_AREAS, STATUSES,
  addMin, fmtDate, nextMeeting, overlaps, stackList, statusOf, uid, weekStart, ymd,
} from "./lib.js";

export function PersonForm({ member, members, onSave, onDelete, onClose }) {
  const m = member || {};
  const isNew = !m.id;
  return (
    <Modal
      title={isNew ? "Add person" : "Edit person"}
      subtitle="Weekly 1:1 is 30 min"
      onClose={onClose}
      onDelete={isNew ? null : () => onDelete(m.id)}
      deleteLabel="Remove from team"
      onSubmit={(fd) => {
        if (!fd.name.trim()) return "Enter a name.";
        if (isNew && members.length >= MAX) return "This team already has 5 people.";
        const day = +fd.meetingDay || 0;
        if (day) {
          const clash = members.find((x) => x.id !== m.id && +x.meetingDay === day && overlaps(x.meetingTime, fd.meetingTime));
          if (clash) return `That overlaps ${clash.name}'s 1:1 (${clash.meetingTime}–${addMin(clash.meetingTime, MEET_MIN)}). Pick another time.`;
        }
        onSave(m.id || uid("m"), {
          name: fd.name.trim(),
          title: fd.title.trim(),
          stack: stackList(fd.stack),
          meetingDay: day || null,
          meetingTime: fd.meetingTime || "10:00",
          order: m.order ?? Date.now(),
        });
      }}
    >
      <div className="grid2">
        <label className="f">Name<input type="text" name="name" defaultValue={m.name} required /></label>
        <label className="f">Title<input type="text" name="title" defaultValue={m.title} placeholder="e.g. Backend Engineer II" /></label>
      </div>
      <label className="f">Main tech stack <small>Comma separated</small>
        <input type="text" name="stack" defaultValue={stackList(m.stack).join(", ")} placeholder="Go, PostgreSQL, Kubernetes" />
      </label>
      <div className="grid2">
        <label className="f">1:1 day
          <select name="meetingDay" defaultValue={m.meetingDay || ""}>
            <option value="">Not scheduled</option>
            {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
          </select>
        </label>
        <label className="f">Start time<input type="time" name="meetingTime" defaultValue={m.meetingTime || "10:00"} step="900" /></label>
      </div>
    </Modal>
  );
}

export function TaskForm({ member, task, onSave, onDelete, onClose }) {
  const t = task || { progress: 0, status: "todo" };
  const isNew = !t.id;
  const [progress, setProgress] = useState(+t.progress || 0);
  return (
    <Modal
      title={isNew ? "Add task" : "Edit task"}
      subtitle={member.name}
      onClose={onClose}
      onDelete={isNew ? null : () => onDelete(t.id)}
      onSubmit={(fd) => {
        if (!fd.title.trim()) return "Describe the task.";
        let p = +fd.progress, status = fd.status;
        if (status === "done") p = 100;
        else if (p === 100 && status !== "review") status = "done";
        onSave(t.id || uid("t"), {
          memberId: member.id, title: fd.title.trim(), stack: stackList(fd.stack), status, progress: p,
          due: fd.due || "", issue: fd.issue.trim(), obstacles: fd.obstacles.trim(), updated: ymd(new Date()),
        });
      }}
    >
      <label className="f">What are they working on?
        <input type="text" name="title" defaultValue={t.title} placeholder="Migrate payments service to gRPC" />
      </label>
      <label className="f">Tech stack <small>Comma separated</small>
        <input type="text" name="stack" defaultValue={stackList(t.stack).join(", ")} placeholder={stackList(member.stack).join(", ")} />
      </label>
      <div className="grid2">
        <label className="f">Status
          <select name="status" defaultValue={t.status}>
            {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="f">Due date<input type="date" name="due" defaultValue={t.due} /></label>
      </div>
      <label className="f">Progress <span className="mono">{progress}%</span>
        <input type="range" name="progress" min="0" max="100" step="5" value={progress} onChange={(e) => setProgress(+e.target.value)} />
      </label>
      <label className="f">Issue <small>A bug, risk or open question</small><textarea name="issue" defaultValue={t.issue} /></label>
      <label className="f">Obstacles <small>What's blocking progress and who can help</small><textarea name="obstacles" defaultValue={t.obstacles} /></label>
    </Modal>
  );
}

function MeetingPrep({ member, tasks, meetings, currentId }) {
  const open = tasks.filter((t) => t.memberId === member.id && t.status !== "done");
  const last = meetings
    .filter((m) => m.memberId === member.id && m.id !== currentId)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  if (!open.length && !last?.actions) return null;
  return (
    <details className="prep" open>
      <summary>Prep for this 1:1</summary>
      {open.length > 0 && (
        <ul>
          {open.map((t) => (
            <li key={t.id}>
              <strong>{t.title}</strong> <span className="sub">· {statusOf(t.status)[1]} · {+t.progress || 0}%</span>
              {t.issue && <div className="sub">Issue: {t.issue}</div>}
              {t.obstacles && <div className="sub">Obstacle: {t.obstacles}</div>}
            </li>
          ))}
        </ul>
      )}
      {last?.actions && (
        <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>
          <strong>Action items from {fmtDate(last.date)}:</strong>{"\n"}{last.actions}
        </p>
      )}
    </details>
  );
}

export function MeetingForm({ member, meeting, tasks, meetings, onSave, onDelete, onClose }) {
  const isNew = !meeting;
  let x = meeting;
  if (!x) {
    const now = new Date();
    let date = ymd(now);
    if (member.meetingDay) {
      const thisWeek = weekStart();
      thisWeek.setDate(thisWeek.getDate() + member.meetingDay - 1);
      date = ymd(thisWeek <= now ? thisWeek : nextMeeting(member) || now);
    }
    x = { date, time: member.meetingTime || "10:00" };
  }
  const open = tasks.filter((t) => t.memberId === member.id && t.status !== "done");
  return (
    <Modal
      wide
      title={isNew ? "Log 1:1" : "Edit 1:1"}
      subtitle={member.name}
      onClose={onClose}
      onDelete={isNew ? null : () => onDelete(x.id)}
      onSubmit={(fd) => {
        if (!fd.date) return "Pick the meeting date.";
        onSave(x.id || uid("mt"), {
          memberId: member.id, date: fd.date, time: fd.time || member.meetingTime || "10:00", duration: MEET_MIN,
          discussed: fd.discussed.trim(), update: fd.update.trim(), blockers: fd.blockers.trim(),
          actions: fd.actions.trim(), supNotes: fd.supNotes.trim(),
        });
      }}
    >
      <div className="grid2" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
        <label className="f">Date<input type="date" name="date" defaultValue={x.date} /></label>
        <label className="f">Start<input type="time" name="time" defaultValue={x.time} step="900" /></label>
        <label className="f">Length<span className="fixed">30 min</span></label>
      </div>
      <MeetingPrep member={member} tasks={tasks} meetings={meetings} currentId={x.id} />
      <label className="f">Topics discussed
        <textarea name="discussed" defaultValue={x.discussed} placeholder={open.length ? "Open tasks: " + open.map((t) => t.title).join("; ") : ""} />
      </label>
      <label className="f">Their update <small>Progress since last week</small><textarea name="update" defaultValue={x.update} /></label>
      <label className="f">Issues and obstacles raised<textarea name="blockers" defaultValue={x.blockers} /></label>
      <label className="f">Action items <small>Who does what by when</small><textarea name="actions" defaultValue={x.actions} /></label>
      <label className="f">Supervisor note after the meeting <small>Your own observations and follow‑ups</small>
        <textarea name="supNotes" defaultValue={x.supNotes} style={{ minHeight: 90 }} />
      </label>
    </Modal>
  );
}

export function ReviewForm({ member, review, reviews, tasks, onSave, onDelete, onClose }) {
  const isNew = !review;
  const x = review || { year: new Date().getFullYear(), ratings: {}, status: "draft" };
  const r = x.ratings || {};
  const done = tasks.filter((t) => t.memberId === member.id && t.status === "done").length;
  return (
    <Modal
      wide
      title="Annual review"
      subtitle={`${member.name} · ${member.title || ""}`}
      onClose={onClose}
      onDelete={isNew ? null : () => onDelete(x.id)}
      onSubmit={(fd) => {
        const year = +fd.year;
        if (!year) return "Enter the review year.";
        if (reviews.find((y) => y.memberId === member.id && +y.year === year && y.id !== x.id))
          return `${member.name} already has a ${year} review. Open that one instead.`;
        const ratings = {};
        REVIEW_AREAS.forEach(([k]) => { if (fd["rt_" + k]) ratings[k] = +fd["rt_" + k]; });
        if (fd.status === "final" && Object.keys(ratings).length < REVIEW_AREAS.length)
          return "Rate every area before marking the review final.";
        onSave(x.id || uid("rv"), {
          memberId: member.id, year, status: fd.status, ratings,
          achievements: fd.achievements.trim(), strengths: fd.strengths.trim(), growth: fd.growth.trim(),
          goals: fd.goals.trim(), overall: fd.overall, supComments: fd.supComments.trim(), empComments: fd.empComments.trim(),
        });
      }}
    >
      <div className="grid2">
        <label className="f">Review year<input type="number" name="year" min="2000" max="2100" defaultValue={x.year} /></label>
        <label className="f">Status
          <select name="status" defaultValue={x.status}>
            <option value="draft">Draft</option>
            <option value="final">Final</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Ratings · 1 = needs work, 5 = outstanding</legend>
        {REVIEW_AREAS.map(([k, l]) => (
          <div className="scale" key={k}>
            <span>{l}</span>
            <div className="dots" role="radiogroup" aria-label={l}>
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n}>
                  <input type="radio" name={`rt_${k}`} value={n} defaultChecked={+r[k] === n} />
                  <span>{n}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
      <label className="f">Key achievements <small>{done} tasks completed in the tracker</small><textarea name="achievements" defaultValue={x.achievements} /></label>
      <div className="grid2">
        <label className="f">Strengths<textarea name="strengths" defaultValue={x.strengths} /></label>
        <label className="f">Areas to grow<textarea name="growth" defaultValue={x.growth} /></label>
      </div>
      <label className="f">Goals for next year<textarea name="goals" defaultValue={x.goals} /></label>
      <label className="f">Overall rating
        <select name="overall" defaultValue={x.overall || ""}>
          <option value="">Choose…</option>
          {OVERALL.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      <label className="f">Supervisor comments<textarea name="supComments" defaultValue={x.supComments} /></label>
      <label className="f">Employee comments<textarea name="empComments" defaultValue={x.empComments} /></label>
    </Modal>
  );
}

export function TeamForm({ settings, onSave, onClose }) {
  return (
    <Modal
      title="Team details"
      onClose={onClose}
      onSubmit={(fd) => { onSave({ teamName: fd.teamName.trim(), supervisor: fd.supervisor.trim() }); }}
    >
      <label className="f">Team name<input type="text" name="teamName" defaultValue={settings.teamName} placeholder="Platform Engineering" /></label>
      <label className="f">Supervisor<input type="text" name="supervisor" defaultValue={settings.supervisor} /></label>
    </Modal>
  );
}
