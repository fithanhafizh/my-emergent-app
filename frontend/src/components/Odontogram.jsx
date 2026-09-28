import { useState, useRef, useEffect } from "react";
import { Activity, X } from "lucide-react";

// FDI numbering
const UPPER_PERM = [["18","17","16","15","14","13","12","11"], ["21","22","23","24","25","26","27","28"]];
const LOWER_PERM = [["48","47","46","45","44","43","42","41"], ["31","32","33","34","35","36","37","38"]];
const UPPER_PRIM = [["55","54","53","52","51"], ["61","62","63","64","65"]];
const LOWER_PRIM = [["85","84","83","82","81"], ["71","72","73","74","75"]];

export const TOOTH_STATUSES = [
  { key: "Sound", label: "Sehat", color: "#e6f6f2" },
  { key: "Caries", label: "Karies", color: "#f6c96b" },
  { key: "Restored", label: "Tumpatan", color: "#87c4f8" },
  { key: "RCT", label: "PSA / RCT", color: "#0d9488" },
  { key: "Missing", label: "Hilang", color: "#94a3b8" },
  { key: "Crown", label: "Crown", color: "#c084fc" },
  { key: "Bridge", label: "Bridge", color: "#a78bfa" },
  { key: "Implant", label: "Implan", color: "#5eead4" },
  { key: "Fractured", label: "Fraktur", color: "#f87171" },
  { key: "Sealant", label: "Sealant", color: "#facc15" },
  { key: "Extraction", label: "Indikasi Cabut", color: "#dc2626" },
  { key: "Impacted", label: "Impaksi", color: "#fb923c" },
];

const statusMap = Object.fromEntries(TOOTH_STATUSES.map(s => [s.key, s]));

function Tooth({ number, statuses = [], onClick, small }) {
  const primary = statuses[0];
  const color = primary ? statusMap[primary]?.color : "#ffffff";
  return (
    <button
      data-testid={`tooth-${number}-button`}
      className={`odo-tooth ${small ? "small" : ""}`}
      style={{ background: color }}
      onClick={onClick}
      type="button"
    >
      <span className="tooth-num">{number}</span>
      {statuses.length > 1 && <em className="multi">+{statuses.length - 1}</em>}
    </button>
  );
}

function ArchRow({ rows, toothMap, onPick, small }) {
  return (
    <div className={`odo-row ${small ? "small" : ""}`}>
      {rows.map((half, i) => (
        <div className="odo-half" key={i}>
          {half.map(n => (
            <Tooth key={n} number={n} statuses={toothMap?.[n] || []}
                   onClick={() => onPick(n)} small={small} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Odontogram({ toothMap = {}, onChange, readOnly }) {
  const [showPrimary, setShowPrimary] = useState(false);
  const [active, setActive] = useState(null);
  const popRef = useRef(null);

  useEffect(() => {
    const close = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setActive(null); };
    if (active) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [active]);

  const pick = (n) => { if (!readOnly) setActive(n); };
  const toggleStatus = (status) => {
    const current = new Set(toothMap[active] || []);
    if (status === "Sound") { current.clear(); }
    else if (current.has(status)) current.delete(status);
    else current.add(status);
    const next = { ...toothMap };
    const arr = Array.from(current);
    if (arr.length === 0) delete next[active]; else next[active] = arr;
    onChange?.(next);
  };
  const clearTooth = () => {
    const next = { ...toothMap }; delete next[active]; onChange?.(next);
  };

  return (
    <div className="odontogram" data-testid="odontogram-widget">
      <div className="odo-toolbar">
        <div className="odo-legend">
          {TOOTH_STATUSES.slice(0, 8).map(s => (
            <span key={s.key}><i style={{ background: s.color }} /> {s.label}</span>
          ))}
        </div>
        <label className="odo-switch">
          <input data-testid="toggle-primary-teeth" type="checkbox"
                 checked={showPrimary} onChange={() => setShowPrimary(v => !v)} />
          <span>Gigi sulung</span>
        </label>
      </div>

      <div className="odo-chart">
        <div className="odo-side-label">Kanan</div>
        <div className="odo-arch">
          <ArchRow rows={UPPER_PERM} toothMap={toothMap} onPick={pick} />
          {showPrimary && <ArchRow rows={UPPER_PRIM} toothMap={toothMap} onPick={pick} small />}
          <div className="odo-divider"><span>Rahang atas / Bawah</span></div>
          {showPrimary && <ArchRow rows={LOWER_PRIM} toothMap={toothMap} onPick={pick} small />}
          <ArchRow rows={LOWER_PERM} toothMap={toothMap} onPick={pick} />
        </div>
        <div className="odo-side-label right">Kiri</div>
      </div>

      {active && (
        <div className="odo-popover" ref={popRef} data-testid={`odo-popover-${active}`}>
          <div className="odo-pop-head">
            <strong>Gigi {active}</strong>
            <button data-testid="close-tooth-popover" onClick={() => setActive(null)}><X size={14} /></button>
          </div>
          <div className="odo-pop-current">
            {(toothMap[active] || []).length ? (toothMap[active] || []).map(s => (
              <span key={s} className="odo-chip" style={{ background: statusMap[s]?.color }}>{statusMap[s]?.label || s}</span>
            )) : <em>Belum ada temuan · pilih status di bawah</em>}
          </div>
          <div className="odo-pop-grid">
            {TOOTH_STATUSES.map(s => {
              const active_ = (toothMap[active] || []).includes(s.key);
              return (
                <button data-testid={`set-tooth-${active}-${s.key}`} key={s.key}
                        className={`odo-status ${active_ ? "on" : ""}`}
                        onClick={() => toggleStatus(s.key)} type="button">
                  <i style={{ background: s.color }} /> {s.label}
                </button>
              );
            })}
          </div>
          <button data-testid={`clear-tooth-${active}`} className="odo-clear" onClick={clearTooth} type="button">
            <Activity size={13} /> Kosongkan gigi ini
          </button>
        </div>
      )}
    </div>
  );
}
