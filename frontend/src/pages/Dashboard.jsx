import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { CalendarDays, ChevronRight, ListPlus, Minus, Pencil, Plus, Settings2, Sparkles, Trash2, Users, X } from "lucide-react";

function Stat({ label, value, detail, accent }) {
  return (
    <div className="stat-block" data-testid={`stat-${label.toLowerCase().replaceAll(" ", "-")}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={accent ? "positive" : ""}>{detail}</small>
    </div>
  );
}

function RequirementManager({ department, onClose, onSaved }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [target, setTarget] = useState(1);
  const [savingId, setSavingId] = useState(null);
  const [linkedFor, setLinkedFor] = useState(null); // { req, patients }

  const load = async () => {
    setLoading(true);
    const r = await api.get("/requirements", { params: { department } });
    setItems(r.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [department]);

  const add = async () => {
    if (!name.trim()) return;
    await api.post("/requirements", { department, name: name.trim(), target: Number(target) || 1 });
    setName(""); setTarget(1);
    await load(); onSaved?.();
  };
  const patch = async (req_id, body) => {
    setSavingId(req_id);
    await api.patch(`/requirements/${req_id}`, body);
    setSavingId(null);
    await load(); onSaved?.();
  };
  const remove = async (req_id) => {
    if (!window.confirm("Hapus requirement ini?")) return;
    await api.delete(`/requirements/${req_id}`);
    await load(); onSaved?.();
  };
  const showLinked = async (req) => {
    const r = await api.get(`/requirements/${req.req_id}/patients`);
    setLinkedFor(r.data);
  };

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="req-manager-backdrop">
      <div className="modal-card req-dialog" onClick={(e) => e.stopPropagation()} data-testid="req-manager-dialog">
        <div className="modal-head">
          <div>
            <span className="eyebrow">REQUIREMENT · {department.toUpperCase()}</span>
            <h2>Kelola daftar tindakan</h2>
          </div>
          <button className="icon-link" onClick={onClose} aria-label="Tutup"
                  data-testid="close-req-manager"><X size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="req-list" data-testid="req-list">
            {loading ? <div className="empty-inline">Memuat...</div> :
              items.length === 0 ? <div className="empty-inline">Belum ada requirement. Tambahkan di bawah.</div> :
              items.map((r) => (
                <RequirementRow key={r.req_id} item={r}
                                saving={savingId === r.req_id}
                                onPatch={(b) => patch(r.req_id, b)}
                                onDelete={() => remove(r.req_id)}
                                onLinked={() => showLinked(r)} />
              ))
            }
          </div>

          <div className="req-add" data-testid="req-add-form">
            <ListPlus size={16} />
            <input data-testid="req-add-name" placeholder="Nama tindakan (mis. Pulpotomi)"
                   value={name} onChange={(e) => setName(e.target.value)} />
            <input data-testid="req-add-target" type="number" min={1} max={99}
                   value={target} onChange={(e) => setTarget(e.target.value)} />
            <button data-testid="req-add-btn" className="primary-button small" onClick={add}
                    disabled={!name.trim()}><Plus size={14} /> Tambah</button>
          </div>
        </div>

        {linkedFor && (
          <LinkedPatientsSheet data={linkedFor} onClose={() => setLinkedFor(null)} />
        )}
      </div>
    </div>
  );
}

function RequirementRow({ item, saving, onPatch, onDelete, onLinked }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [target, setTarget] = useState(item.target);
  const pct = item.target ? Math.min(100, Math.round((item.done / item.target) * 100)) : 0;
  const save = () => {
    if (!name.trim()) return;
    onPatch({ name: name.trim(), target: Number(target) || 1 });
    setEditing(false);
  };
  return (
    <div className="req-row" data-testid={`req-row-${item.req_id}`}>
      <div className="req-row-head">
        {editing ? (
          <>
            <input data-testid={`req-edit-name-${item.req_id}`} value={name}
                   onChange={(e) => setName(e.target.value)} />
            <input data-testid={`req-edit-target-${item.req_id}`} type="number" min={1}
                   value={target} onChange={(e) => setTarget(e.target.value)} />
            <button className="pill-button" data-testid={`req-save-${item.req_id}`}
                    onClick={save} disabled={saving}>Simpan</button>
            <button className="pill-ghost" onClick={() => { setEditing(false); setName(item.name); setTarget(item.target); }}>Batal</button>
          </>
        ) : (
          <>
            <button className="req-name" onClick={onLinked}
                    data-testid={`req-link-${item.req_id}`} title="Lihat pasien terkait">
              {item.name}
            </button>
            <span className="req-count" data-testid={`req-count-${item.req_id}`}>
              <b>{item.done}</b> / {item.target}
            </span>
            <button className="icon-btn" onClick={() => onPatch({ delta: -1 })}
                    disabled={saving || item.done <= 0}
                    data-testid={`req-dec-${item.req_id}`} aria-label="Kurangi"><Minus size={14} /></button>
            <button className="icon-btn plus" onClick={() => onPatch({ delta: 1 })}
                    disabled={saving}
                    data-testid={`req-inc-${item.req_id}`} aria-label="Tambah"><Plus size={14} /></button>
            <button className="icon-btn" onClick={() => setEditing(true)}
                    data-testid={`req-edit-${item.req_id}`} aria-label="Edit"><Pencil size={13} /></button>
            <button className="icon-btn danger" onClick={onDelete}
                    data-testid={`req-del-${item.req_id}`} aria-label="Hapus"><Trash2 size={13} /></button>
          </>
        )}
      </div>
      <div className="req-progress"><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function LinkedPatientsSheet({ data, onClose }) {
  const patients = data.patients || [];
  return (
    <div className="modal-backdrop nested" onClick={onClose} data-testid="linked-backdrop">
      <div className="modal-card linked-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">CROSS-LINK</span>
            <h2>Pasien untuk "{data.requirement.name}"</h2>
          </div>
          <button className="icon-link" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
        </div>
        <div className="modal-body">
          {patients.length === 0 ? (
            <div className="empty-inline">
              Belum ada pasien dengan diagnosis yang cocok di departemen {data.requirement.department}.
            </div>
          ) : (
            <ul className="linked-list" data-testid="linked-list">
              {patients.map((p) => (
                <li key={p.id} data-testid={`linked-patient-${p.id}`}>
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.rm} · {p.diagnosis || "—"}</small>
                  </div>
                  <em className={`pill pill-${p.reliability || "green"}`}>{p.tag || "#Pasien"}</em>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ setPage, setDeptFilter }) {
  const [data, setData] = useState(null);
  const [manage, setManage] = useState(null);

  const load = () => api.get("/dashboard").then(r => setData(r.data));
  useEffect(() => { load(); }, []);
  if (!data) return <div className="page-loading">Memuat ringkasan klinik...</div>;

  const openDept = (name) => { setDeptFilter?.(name); setPage("patients"); };
  const todayLabel = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{todayLabel.toUpperCase()}</span>
          <h1>Selamat datang, Coass. <span className="wave">✦</span></h1>
          <p>Ringkasan requirement, agenda, dan progres UKMP2DG-mu.</p>
        </div>
        <button data-testid="add-patient-button" className="primary-button" onClick={() => setPage("patients")}>
          <Users size={17} /> Buka logbook pasien
        </button>
      </div>

      <section className="hero-strip">
        <div>
          <span className="eyebrow light">COUNTDOWN UKMP2DG</span>
          <strong data-testid="ukmp2dg-countdown">{data.countdown} <small>hari lagi</small></strong>
          <p>Target kelulusan · 20 Oktober 2026</p>
        </div>
        <div className="hero-ring">
          <div><b>{data.overall}%</b><span>overall</span></div>
        </div>
        <div className="hero-metric">
          <span>Requirement selesai</span>
          <strong>{data.total_done} <small>/ {data.total_target} tindakan</small></strong>
          <div className="mini-progress"><i style={{ width: `${data.overall}%` }} /></div>
        </div>
      </section>

      <div className="stats-row">
        <Stat label="Pasien aktif" value={data.stats.patients} detail="Tersimpan di logbook" accent />
        <Stat label="Kunjungan" value={data.stats.visits} detail="Total dari semua pasien" />
        <Stat label="Progres" value={`${data.stats.acc}%`} detail="Berdasarkan target departemen" accent />
      </div>

      <div className="section-heading">
        <div>
          <span className="eyebrow">REQUIREMENT TRACKER</span>
          <h2>Progres per departemen · bisa diedit</h2>
        </div>
        <button data-testid="view-all-requirements-button" className="text-button" onClick={() => setPage("patients")}>
          Lihat pasien <ChevronRight size={16} />
        </button>
      </div>

      <div className="department-grid">
        {data.departments.map((d, i) => (
          <div data-testid={`department-${i}-card`} className="department-card" key={d.name}>
            <div className="dept-top">
              <span>{d.name}</span>
              <b>{d.pct}%</b>
            </div>
            <div className="progress-track">
              <i style={{ width: `${d.pct}%` }} />
            </div>
            <div className="dept-bottom">
              <small>{d.done} / {d.target || 0} · {d.items} item</small>
              <em className={d.status === "Lulus" ? "done" : d.status === "On Progress" ? "progress" : "idle"}>{d.status}</em>
            </div>
            <div className="dept-actions">
              <button className="pill-ghost small" data-testid={`department-${i}-open-patients`}
                      onClick={() => openDept(d.name)}>
                Lihat pasien
              </button>
              <button className="pill-button small" data-testid={`department-${i}-manage`}
                      onClick={() => setManage(d.name)}>
                <Settings2 size={13} /> Kelola
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="lower-grid">
        <section className="clean-section">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">AGENDA</span>
              <h2>Hari ini</h2>
            </div>
            <button data-testid="open-calendar-button" className="icon-link" onClick={() => setPage("calendar")}>
              <CalendarDays size={18} />
            </button>
          </div>
          {data.today.length === 0 ? (
            <div className="empty-inline">Belum ada agenda hari ini. Tambahkan di halaman Kalender.</div>
          ) : data.today.map((t, i) => (
            <div data-testid={`agenda-item-${i}`} className="agenda-item" key={t.id || i}>
              <time>{t.time || "—"}</time>
              <div><strong>{t.title}</strong><small>{t.kind}</small></div>
              <ChevronRight size={16} />
            </div>
          ))}
        </section>

        <section className="clean-section focus-section">
          <div className="focus-icon"><Sparkles size={20} /></div>
          <span className="eyebrow">FOCUS OF THE DAY</span>
          <h2>Diskusikan kasus dengan Dental AI.</h2>
          <p>Gunakan AI untuk membuat draft SOAP note atau treatment plan sebelum bimbingan.</p>
          <button data-testid="open-ai-button" className="text-button" onClick={() => setPage("ai")}>
            Buka Dental AI <ChevronRight size={16} />
          </button>
        </section>
      </div>

      {manage && (
        <RequirementManager department={manage}
                            onClose={() => setManage(null)}
                            onSaved={load} />
      )}
    </div>
  );
}
