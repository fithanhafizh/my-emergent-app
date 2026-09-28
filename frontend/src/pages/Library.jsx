import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { AlertTriangle, BookMarked, ChevronRight, ExternalLink, FileText, Plus, ShieldAlert, Trash2, X } from "lucide-react";

const SOP_CATEGORIES = ["Konservasi", "Endodontik", "Periodonsia", "Prostodonsia", "Ortodonsia", "Pedodonsia", "Bedah Mulut", "Radiologi"];

function SOPModal({ open, onClose, onSave }) {
  const [f, setF] = useState({ title: "", category: SOP_CATEGORIES[0], steps: "", read_time: "5 min", tags: "" });
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} data-testid="sop-modal">
        <div className="modal-head">
          <div><span className="eyebrow">SOP BARU</span><h3>Simpan protokol tindakan</h3></div>
          <button data-testid="close-sop-modal" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <label className="span2">Judul<input data-testid="sop-title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
            <label>Kategori<select data-testid="sop-cat" value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{SOP_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
            <label>Estimasi baca<input data-testid="sop-time" value={f.read_time} onChange={e => setF({ ...f, read_time: e.target.value })} placeholder="5 min" /></label>
            <label className="span2">Tags (koma)<input data-testid="sop-tags" value={f.tags} onChange={e => setF({ ...f, tags: e.target.value })} /></label>
            <label className="span2">Langkah-langkah<textarea data-testid="sop-steps" rows={8} value={f.steps} onChange={e => setF({ ...f, steps: e.target.value })} /></label>
          </div>
        </div>
        <div className="modal-foot">
          <button className="ghost-button" onClick={onClose}>Batal</button>
          <button data-testid="save-sop" className="primary-button" disabled={!f.title} onClick={() => onSave({ ...f, tags: f.tags.split(",").map(x => x.trim()).filter(Boolean) })}>Simpan SOP</button>
        </div>
      </div>
    </div>
  );
}

function JournalModal({ open, onClose, onSave }) {
  const [f, setF] = useState({ title: "", source: "", url: "", department: "", highlights: "" });
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} data-testid="journal-modal">
        <div className="modal-head">
          <div><span className="eyebrow">BOOKMARK JURNAL</span><h3>Simpan referensi</h3></div>
          <button data-testid="close-journal-modal" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <label className="span2">Judul<input data-testid="jrn-title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
            <label>Sumber<input data-testid="jrn-source" value={f.source} onChange={e => setF({ ...f, source: e.target.value })} /></label>
            <label>Departemen<input data-testid="jrn-dept" value={f.department} onChange={e => setF({ ...f, department: e.target.value })} /></label>
            <label className="span2">URL<input data-testid="jrn-url" value={f.url} onChange={e => setF({ ...f, url: e.target.value })} placeholder="https://" /></label>
            <label className="span2">Highlight untuk bimbingan<textarea data-testid="jrn-highlights" rows={4} value={f.highlights} onChange={e => setF({ ...f, highlights: e.target.value })} /></label>
          </div>
        </div>
        <div className="modal-foot">
          <button className="ghost-button" onClick={onClose}>Batal</button>
          <button data-testid="save-journal" className="primary-button" disabled={!f.title} onClick={() => onSave(f)}>Simpan bookmark</button>
        </div>
      </div>
    </div>
  );
}

export default function Library() {
  const [tab, setTab] = useState("sop");
  const [sops, setSops] = useState([]);
  const [journals, setJournals] = useState([]);
  const [safety, setSafety] = useState([]);
  const [sopOpen, setSopOpen] = useState(false);
  const [jrnOpen, setJrnOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [expandedSop, setExpandedSop] = useState(null);

  const loadSops = () => {
    const q = new URLSearchParams(); if (category) q.set("category", category); if (query) q.set("q", query);
    api.get(`/sops?${q.toString()}`).then(r => setSops(r.data));
  };
  const loadJournals = () => api.get("/journals").then(r => setJournals(r.data));
  const loadSafety = () => api.get("/safety/rules").then(r => setSafety(r.data));

  useEffect(() => { loadSops(); loadJournals(); loadSafety(); }, []);
  useEffect(() => { loadSops(); }, [category, query]);

  const saveSop = async (payload) => { await api.post("/sops", payload); setSopOpen(false); loadSops(); };
  const removeSop = async (id) => { await api.delete(`/sops/${id}`); loadSops(); };
  const saveJournal = async (payload) => { await api.post("/journals", payload); setJrnOpen(false); loadJournals(); };
  const removeJournal = async (id) => { await api.delete(`/journals/${id}`); loadJournals(); };

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <span className="eyebrow">LIBRARY</span>
          <h1>SOP, drug safety & jurnal</h1>
          <p>Cari referensi tindakan, peringatan obat, dan bookmark jurnal per stase.</p>
        </div>
        {tab === "sop" && <button data-testid="library-add-sop" className="primary-button" onClick={() => setSopOpen(true)}><Plus size={16} /> SOP baru</button>}
        {tab === "journals" && <button data-testid="library-add-journal" className="primary-button" onClick={() => setJrnOpen(true)}><Plus size={16} /> Bookmark jurnal</button>}
      </div>

      <div className="tab-strip" data-testid="library-tabs">
        {[["sop", "SOP Tindakan", FileText], ["safety", "Drug Safety", ShieldAlert], ["journals", "Jurnal Bookmark", BookMarked]].map(([id, lbl, Icon]) => (
          <button key={id} data-testid={`tab-${id}`} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            <Icon size={14} /> {lbl}
          </button>
        ))}
      </div>

      {tab === "sop" && (
        <>
          <div className="filter-bar">
            <input data-testid="sop-search" placeholder="Cari SOP..." value={query} onChange={e => setQuery(e.target.value)} />
            <select data-testid="sop-cat-filter" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Semua kategori</option>
              {SOP_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="sop-grid" data-testid="sop-grid">
            {sops.length === 0 && <div className="empty-inline">Belum ada SOP.</div>}
            {sops.map(s => (
              <article key={s.id} className="sop-card" data-testid={`sop-${s.id}`}>
                <div className="sop-head">
                  <span className="chip-cat">{s.category}</span>
                  <button data-testid={`del-sop-${s.id}`} className="icon-danger" onClick={() => removeSop(s.id)}><Trash2 size={14} /></button>
                </div>
                <h3>{s.title}</h3>
                <small>{s.read_time}</small>
                {(s.tags || []).length > 0 && (
                  <div className="tag-list mini">{s.tags.map(t => <span key={t} className="chip-tag mini">{t}</span>)}</div>
                )}
                <button data-testid={`toggle-sop-${s.id}`} className="text-button" onClick={() => setExpandedSop(expandedSop === s.id ? null : s.id)}>
                  {expandedSop === s.id ? "Tutup" : "Baca langkah"} <ChevronRight size={14} />
                </button>
                {expandedSop === s.id && (
                  <pre className="sop-body" data-testid={`sop-body-${s.id}`}>{s.steps}</pre>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      {tab === "safety" && (
        <div className="safety-grid" data-testid="safety-grid">
          <div className="clean-section" style={{ marginBottom: 16 }}>
            <div className="panel-heading">
              <div><span className="eyebrow">ATURAN AKTIF</span><h3>Referensi kontraindikasi</h3></div>
              <span className="hint"><AlertTriangle size={14} /> Alert otomatis muncul di profil pasien</span>
            </div>
          </div>
          <div className="safety-cards">
            {safety.map((r, i) => (
              <div key={i} className={`safety-card ${r.severity}`} data-testid={`safety-rule-${i}`}>
                <div className="sc-head">
                  <strong>{r.title}</strong>
                  <span className={`badge ${r.severity}`}>{r.severity === "critical" ? "Kritis" : "Waspada"}</span>
                </div>
                <p>{r.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "journals" && (
        <div className="journal-grid" data-testid="journal-grid">
          {journals.length === 0 && <div className="empty-inline">Belum ada bookmark jurnal.</div>}
          {journals.map(j => (
            <article key={j.id} className="journal-card" data-testid={`journal-${j.id}`}>
              <div className="sop-head">
                <span className="chip-cat">{j.department || "Umum"}</span>
                <button data-testid={`del-jrn-${j.id}`} className="icon-danger" onClick={() => removeJournal(j.id)}><Trash2 size={14} /></button>
              </div>
              <h3>{j.title}</h3>
              <small>{j.source}</small>
              {j.highlights && <p>{j.highlights}</p>}
              {j.url && (
                <a data-testid={`jrn-link-${j.id}`} href={j.url} target="_blank" rel="noreferrer" className="text-button">
                  Buka sumber <ExternalLink size={13} />
                </a>
              )}
            </article>
          ))}
        </div>
      )}

      <SOPModal open={sopOpen} onClose={() => setSopOpen(false)} onSave={saveSop} />
      <JournalModal open={jrnOpen} onClose={() => setJrnOpen(false)} onSave={saveJournal} />
    </div>
  );
}
