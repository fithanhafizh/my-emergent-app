import { useEffect, useMemo, useState } from "react";
import { api, API } from "../lib/api";
import Odontogram, { TOOTH_STATUSES } from "../components/Odontogram";
import { AlertTriangle, ChevronRight, FileText, Plus, ShieldCheck, Stethoscope, Trash2, Upload, Users, X } from "lucide-react";

const DEPTS = ["Bedah Mulut", "Konservasi Gigi", "Periodonsia", "Prostodonsia", "Ortodonsia", "Pedodonsia", "Oral Medicine", "Radiologi"];
const TAGS = ["#PasienKooperatif", "#KasusSulit", "#Ujian", "#Kontrol", "#Rujukan"];

function AddPatientDialog({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", rm: "", age: "", phone: "", address: "", department: DEPTS[0], diagnosis: "", tag: TAGS[0], reliability: "green", medical_history: "", allergies: "", notes: "" });
  const [saving, setSaving] = useState(false);
  if (!open) return null;
  const submit = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const payload = { ...form, age: form.age ? Number(form.age) : null,
        medical_history: form.medical_history.split(",").map(s => s.trim()).filter(Boolean),
        allergies: form.allergies.split(",").map(s => s.trim()).filter(Boolean) };
      const r = await api.post("/patients", payload);
      onCreated?.(r.data); onClose();
    } finally { setSaving(false); }
  };
  const f = (k, v) => setForm(s => ({ ...s, [k]: v }));
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} data-testid="new-patient-modal">
        <div className="modal-head">
          <div><span className="eyebrow">PASIEN BARU</span><h3>Tambah data pasien</h3></div>
          <button data-testid="close-new-patient" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <label>Nama lengkap<input data-testid="new-patient-name" value={form.name} onChange={e => f("name", e.target.value)} /></label>
            <label>No. RM<input data-testid="new-patient-rm" value={form.rm} onChange={e => f("rm", e.target.value)} /></label>
            <label>Usia<input data-testid="new-patient-age" type="number" value={form.age} onChange={e => f("age", e.target.value)} /></label>
            <label>No. HP (WhatsApp)<input data-testid="new-patient-phone" value={form.phone} onChange={e => f("phone", e.target.value)} placeholder="628xxx" /></label>
            <label className="span2">Alamat<input data-testid="new-patient-address" value={form.address} onChange={e => f("address", e.target.value)} /></label>
            <label>Departemen<select data-testid="new-patient-department" value={form.department} onChange={e => f("department", e.target.value)}>{DEPTS.map(d => <option key={d}>{d}</option>)}</select></label>
            <label>Tag<select data-testid="new-patient-tag" value={form.tag} onChange={e => f("tag", e.target.value)}>{TAGS.map(d => <option key={d}>{d}</option>)}</select></label>
            <label>Indikator kehadiran<select data-testid="new-patient-reliability" value={form.reliability} onChange={e => f("reliability", e.target.value)}><option value="green">Hijau · Sering hadir</option><option value="yellow">Kuning · Kadang telat</option><option value="red">Merah · Sering absen</option></select></label>
            <label className="span2">Diagnosis awal<input data-testid="new-patient-diagnosis" value={form.diagnosis} onChange={e => f("diagnosis", e.target.value)} /></label>
            <label className="span2">Riwayat sistemik (pisahkan dengan koma)<input data-testid="new-patient-history" value={form.medical_history} onChange={e => f("medical_history", e.target.value)} placeholder="Hipertensi, Diabetes" /></label>
            <label className="span2">Alergi (pisahkan dengan koma)<input data-testid="new-patient-allergies" value={form.allergies} onChange={e => f("allergies", e.target.value)} placeholder="Penisilin, Lateks" /></label>
            <label className="span2">Catatan awal<textarea data-testid="new-patient-notes" value={form.notes} onChange={e => f("notes", e.target.value)} rows={3} /></label>
          </div>
        </div>
        <div className="modal-foot">
          <button data-testid="cancel-new-patient" className="ghost-button" onClick={onClose}>Batal</button>
          <button data-testid="save-new-patient" className="primary-button" onClick={submit} disabled={saving || !form.name}>{saving ? "Menyimpan..." : "Simpan pasien"}</button>
        </div>
      </div>
    </div>
  );
}

function TagList({ items, onRemove, testid }) {
  return (
    <div className="tag-list" data-testid={testid}>
      {(items || []).length === 0 && <em className="muted">—</em>}
      {(items || []).map(t => (
        <span key={t} className="chip-tag">{t}
          {onRemove && <button data-testid={`remove-${t.replaceAll(" ","-")}`} onClick={() => onRemove(t)}><X size={11} /></button>}
        </span>
      ))}
    </div>
  );
}

function MediaComparer({ patient }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("before");
  const load = () => api.get(`/files?patient_id=${patient.id}`).then(r => setFiles(r.data));
  useEffect(() => { load(); }, [patient.id]);
  const upload = async (file) => {
    if (!file) return;
    setUploading(true); setError("");
    const form = new FormData(); form.append("file", file);
    try {
      await api.post(`/files/upload?patient_id=${patient.id}&label=${label}`, form,
                     { headers: { "Content-Type": "multipart/form-data" } });
      await load();
    } catch { setError("Upload gagal. Cek koneksi/format."); }
    finally { setUploading(false); }
  };
  const bucket = (lbl) => files.filter(f => f.label === lbl);
  const url = (f) => `${API}/files/${f.id}/download`;
  return (
    <div className="media-panel-v2 clean-section">
      <div className="panel-heading">
        <div><span className="eyebrow">MEDIA KLINIS</span><h3>Photo & radiograph comparer</h3></div>
        <div className="label-toggle" data-testid="media-label-toggle">
          {["before", "after", "xray-pre", "xray-post"].map(l => (
            <button key={l} data-testid={`label-${l}`} className={label === l ? "on" : ""} onClick={() => setLabel(l)} type="button">{l.replace("-", " ")}</button>
          ))}
        </div>
      </div>
      <div className="media-compare-grid">
        {[["before", "BEFORE"], ["after", "AFTER"], ["xray-pre", "X-RAY · PRE"], ["xray-post", "X-RAY · POST"]].map(([k, ttl]) => (
          <div className="media-slot" key={k}>
            <span>{ttl}</span>
            <div className="thumb-wrap">
              {bucket(k).length ? bucket(k).map(f => (
                f.content_type.startsWith("image/") ? (
                  <a href={url(f)} target="_blank" rel="noreferrer" key={f.id} data-testid={`media-thumb-${f.id}`}>
                    <img src={url(f)} alt={f.original_filename} />
                  </a>
                ) : (
                  <a href={url(f)} target="_blank" rel="noreferrer" key={f.id} className="pdf-tile" data-testid={`media-pdf-${f.id}`}>
                    <FileText size={22} /><small>{f.original_filename}</small>
                  </a>
                )
              )) : <div className="placeholder-photo"><FileText size={22} /><small>Belum ada foto</small></div>}
            </div>
          </div>
        ))}
      </div>
      <label className="upload-button" data-testid="media-upload-label">
        <Upload size={16} /> {uploading ? "Mengunggah..." : `Upload ke slot "${label}"`}
        <input data-testid="media-upload-input" type="file" accept="image/*,.pdf" hidden
               onChange={e => upload(e.target.files[0])} />
      </label>
      {error && <div data-testid="clinical-error-message" className="clinical-error">{error}</div>}
    </div>
  );
}

function SafetyAlerts({ patient }) {
  const [alerts, setAlerts] = useState([]);
  useEffect(() => {
    api.post("/safety/check", { history: patient.medical_history || [], allergies: patient.allergies || [] })
       .then(r => setAlerts(r.data.alerts || []));
  }, [patient.id, JSON.stringify(patient.medical_history), JSON.stringify(patient.allergies)]);
  if (!alerts.length) return null;
  return (
    <div className="safety-panel" data-testid="safety-alerts">
      <div className="safety-head"><AlertTriangle size={16} /> Peringatan kontraindikasi</div>
      {alerts.map((a, i) => (
        <div className={`safety-item ${a.severity}`} key={i} data-testid={`safety-${a.title.replaceAll(" ","-")}`}>
          <strong>{a.title}</strong>
          <p>{a.recommendation}</p>
        </div>
      ))}
    </div>
  );
}

export default function Patients({ deptFilter, setDeptFilter }) {
  const [patients, setPatients] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState(deptFilter || "");
  const [tagFilter, setTagFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const load = () => api.get("/patients").then(r => setPatients(r.data));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (deptFilter !== undefined) setDept(deptFilter || ""); }, [deptFilter]);

  const filtered = useMemo(() => patients.filter(p =>
    (!dept || p.department === dept) &&
    (!tagFilter || p.tag === tagFilter) &&
    (!query || (p.name + " " + (p.rm || "") + " " + (p.diagnosis || "")).toLowerCase().includes(query.toLowerCase()))
  ), [patients, dept, tagFilter, query]);

  const selected = patients.find(p => p.id === selectedId);

  const updateTooth = async (map) => {
    setPatients(ps => ps.map(p => p.id === selected.id ? { ...p, tooth_map: map } : p));
    await api.patch(`/patients/${selected.id}`, { tooth_map: map });
  };
  const updateField = async (fields) => {
    setPatients(ps => ps.map(p => p.id === selected.id ? { ...p, ...fields } : p));
    await api.patch(`/patients/${selected.id}`, fields);
  };
  const removePatient = async () => {
    if (!selected) return;
    if (!window.confirm(`Hapus data pasien ${selected.name}?`)) return;
    await api.delete(`/patients/${selected.id}`);
    setSelectedId(null); load();
  };

  const [newHistory, setNewHistory] = useState("");
  const [newAllergy, setNewAllergy] = useState("");

  const waHref = (p) => `https://wa.me/${(p.phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(`Halo ${p.name}, mengingatkan jadwal kontrol klinik gigi.`)}`;

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <span className="eyebrow">LOGBOOK KLINIK</span>
          <h1>Pasien & odontogram interaktif</h1>
          <p>Catat setiap temuan dengan rapi—dari anamnesis, odontogram FDI, hingga kontrol berikutnya.</p>
        </div>
        <button data-testid="patient-add-button" className="primary-button" onClick={() => setShowNew(true)}>
          <Users size={17} /> Pasien baru
        </button>
      </div>

      <div className="filter-bar">
        <input data-testid="patient-search" placeholder="Cari nama, RM, diagnosis..." value={query} onChange={e => setQuery(e.target.value)} />
        <select data-testid="filter-department" value={dept} onChange={e => { setDept(e.target.value); setDeptFilter?.(e.target.value); }}>
          <option value="">Semua departemen</option>
          {DEPTS.map(d => <option key={d}>{d}</option>)}
        </select>
        <select data-testid="filter-tag" value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
          <option value="">Semua tag</option>
          {TAGS.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      <div className="logbook-layout">
        <section className="patient-list clean-section">
          <div className="list-toolbar">
            <strong data-testid="patient-count">{filtered.length} pasien</strong>
            <small>{dept || "Semua departemen"}</small>
          </div>
          {filtered.length === 0 && <div className="empty-inline">Tidak ada pasien pada filter ini.</div>}
          {filtered.map(p => (
            <button data-testid={`patient-${p.id}-row`}
                    className={selectedId === p.id ? "patient-row selected" : "patient-row"}
                    key={p.id} onClick={() => setSelectedId(p.id)}>
              <div className={`reliability ${p.reliability}`}></div>
              <div className="patient-main">
                <strong>{p.name}</strong>
                <span>{p.rm || "—"} · {p.age || "?"} tahun</span>
                <small>{p.department}</small>
              </div>
              <div className="patient-row-right">
                <em>{p.tag}</em>
                <ChevronRight size={16} />
              </div>
            </button>
          ))}
        </section>

        {selected ? (
          <section className="patient-detail">
            <div className="detail-head">
              <div>
                <span className="eyebrow">PATIENT PROFILE · {selected.rm || selected.id}</span>
                <h2>{selected.name}</h2>
                <p>{selected.age || "?"} tahun · {selected.department} · <span className="diagnosis">{selected.diagnosis || "—"}</span></p>
                <p className="addr">{selected.address || ""}</p>
              </div>
              <div className="detail-actions">
                {selected.phone && (
                  <a data-testid="patient-whatsapp-button" className="whatsapp"
                     href={waHref(selected)} target="_blank" rel="noreferrer">WhatsApp</a>
                )}
                <button data-testid="delete-patient-button" className="danger-button" onClick={removePatient}>
                  <Trash2 size={14} /> Hapus
                </button>
              </div>
            </div>

            <SafetyAlerts patient={selected} />

            <div className="clean-section anamnesis-panel">
              <div className="panel-heading">
                <div><span className="eyebrow">ANAMNESIS</span><h3>Riwayat sistemik & alergi</h3></div>
                <span className="hint"><ShieldCheck size={14} /> Alert kontraindikasi aktif otomatis</span>
              </div>
              <div className="anamnesis-grid">
                <div>
                  <label>Riwayat sistemik</label>
                  <TagList items={selected.medical_history} testid="patient-history-tags"
                           onRemove={t => updateField({ medical_history: (selected.medical_history || []).filter(x => x !== t) })} />
                  <div className="inline-add">
                    <input data-testid="add-history-input" value={newHistory} onChange={e => setNewHistory(e.target.value)} placeholder="mis. Hipertensi" />
                    <button data-testid="add-history-btn" onClick={() => { if (!newHistory.trim()) return; updateField({ medical_history: [...(selected.medical_history || []), newHistory.trim()] }); setNewHistory(""); }}><Plus size={14} /></button>
                  </div>
                </div>
                <div>
                  <label>Alergi</label>
                  <TagList items={selected.allergies} testid="patient-allergy-tags"
                           onRemove={t => updateField({ allergies: (selected.allergies || []).filter(x => x !== t) })} />
                  <div className="inline-add">
                    <input data-testid="add-allergy-input" value={newAllergy} onChange={e => setNewAllergy(e.target.value)} placeholder="mis. Penisilin" />
                    <button data-testid="add-allergy-btn" onClick={() => { if (!newAllergy.trim()) return; updateField({ allergies: [...(selected.allergies || []), newAllergy.trim()] }); setNewAllergy(""); }}><Plus size={14} /></button>
                  </div>
                </div>
                <div className="span2">
                  <label>Catatan klinis</label>
                  <textarea data-testid="patient-notes-input" rows={3} value={selected.notes || ""}
                            onChange={e => setPatients(ps => ps.map(p => p.id === selected.id ? { ...p, notes: e.target.value } : p))}
                            onBlur={e => updateField({ notes: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="clean-section">
              <div className="panel-heading">
                <div><span className="eyebrow">ODONTOGRAM FDI</span><h3>Peta gigi interaktif</h3></div>
                <span className="hint"><Stethoscope size={14} /> Klik gigi untuk atur status</span>
              </div>
              <Odontogram toothMap={selected.tooth_map || {}} onChange={updateTooth} />
            </div>

            <MediaComparer patient={selected} />
          </section>
        ) : (
          <div className="empty-detail">
            <Stethoscope size={32} />
            <h2>Pilih pasien</h2>
            <p>Detail klinis, odontogram, dan media akan muncul di sini.</p>
          </div>
        )}
      </div>

      <AddPatientDialog open={showNew} onClose={() => setShowNew(false)} onCreated={load} />
    </div>
  );
}
