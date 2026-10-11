import { useEffect, useRef, useState } from "react";
import { initials, level, stackList } from "./lib.js";

export function Bar({ p }) {
  const v = Math.max(0, Math.min(100, p));
  return (
    <div className="barline">
      <div className={`bar lvl-${level(p)}`} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${v}%` }} />
      </div>
      <span className="num">{Math.round(p)}%</span>
    </div>
  );
}

export function StackChips({ stack }) {
  return (
    <div className="chips">
      {stackList(stack).map((s) => (
        <span key={s} className="chip stack">{s}</span>
      ))}
    </div>
  );
}

export function Avatar({ name, large }) {
  return <span className={`avatar${large ? " lg" : ""}`}>{initials(name)}</span>;
}

export function Modal({ title, subtitle, wide, onClose, onSubmit, onDelete, deleteLabel = "Delete", children }) {
  const ref = useRef(null);
  const formRef = useRef(null);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d.open) d.showModal();
    const first = formRef.current?.querySelector("input:not([type=hidden]),select,textarea");
    first?.focus();
    return () => { if (d.open) d.close(); };
  }, []);

  function requestClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  function submit(e) {
    e.preventDefault();
    const err = onSubmit(Object.fromEntries(new FormData(formRef.current)));
    if (err) setError(err);
    else onClose();
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); formRef.current.requestSubmit(); }
  }

  return (
    <dialog
      ref={ref}
      className={wide ? "wide" : ""}
      onCancel={(e) => { e.preventDefault(); requestClose(); }}
      onMouseDown={(e) => { if (e.target === ref.current) requestClose(); }}
    >
      <form ref={formRef} noValidate onSubmit={submit} onInput={() => { setDirty(true); setConfirmClose(false); }} onKeyDown={onKeyDown}>
        <div className="dhead">
          <h2>{title}</h2>
          <div className="dhead-r">
            {subtitle && <span className="muted">{subtitle}</span>}
            <button type="button" className="icon-btn" aria-label="Close" onClick={requestClose}>×</button>
          </div>
        </div>
        {children}
        {error && <p role="alert" className="ferr">{error}</p>}
        {confirmClose ? (
          <div className="dfoot confirm" role="alert">
            <span>You have unsaved changes. Discard them?</span>
            <div className="r">
              <button type="button" className="btn" onClick={() => setConfirmClose(false)}>Keep editing</button>
              <button type="button" className="btn danger armed" onClick={onClose}>Discard</button>
            </div>
          </div>
        ) : (
          <div className="dfoot">
            {onDelete && (
              <button type="button" className="btn danger" onClick={() => { onDelete(); onClose(); }}>{deleteLabel}</button>
            )}
            <div className="r">
              <span className="hint muted">Ctrl/⌘ + Enter to save</span>
              <button type="button" className="btn" onClick={requestClose}>Cancel</button>
              <button type="submit" className="btn primary">Save</button>
            </div>
          </div>
        )}
      </form>
    </dialog>
  );
}
