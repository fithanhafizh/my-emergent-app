import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, UserCheck, X } from "lucide-react";

const KINDS = ["Pasien", "Bimbingan", "Deadline", "Reminder"];
const kindColor = { Pasien: "#0d9488", Bimbingan: "#7c3aed", Deadline: "#dc2626", Reminder: "#f59e0b" };

function ym(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function pad(n) { return String(n).padStart(2, "0"); }
function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function firstDay(year, month) { return new Date(year, month, 1).getDay(); } // 0 = Sun

function EventModal({ open, onClose, onSave, initialDate }) {
  const [form, setForm] = useState({ date: initialDate, time: "", title: "", kind: "Pasien", notes: "" });
  useEffect(() => { setForm(f => ({ ...f, date: initialDate })); }, [initialDate]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card small" onClick={e => e.stopPropagation()} data-testid="event-modal">
        <div className="modal-head">
          <div><span className="eyebrow">AGENDA BARU</span><h3>{form.date}</h3></div>
          <button data-testid="close-event-modal" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <label className="span2">Judul agenda<input data-testid="event-title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
            <label>Waktu<input data-testid="event-time" type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></label>
            <label>Jenis<select data-testid="event-kind" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>{KINDS.map(k => <option key={k}>{k}</option>)}</select></label>
            <label className="span2">Catatan<textarea data-testid="event-notes" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
        </div>
        <div className="modal-foot">
          <button className="ghost-button" onClick={onClose}>Batal</button>
          <button data-testid="save-event" className="primary-button" disabled={!form.title} onClick={() => { onSave(form); onClose(); }}>Simpan</button>
        </div>
      </div>
    </div>
  );
}

function SupervisorPanel() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ name: "", department: "", piket_day: "Senin", phone: "", notes: "" });
  const [open, setOpen] = useState(false);
  const load = () => api.get("/supervisors").then(r => setList(r.data));
  useEffect(() => { load(); }, []);
  const create = async () => {
    if (!form.name) return;
    await api.post("/supervisors", form);
    setForm({ name: "", department: "", piket_day: "Senin", phone: "", notes: "" });
    setOpen(false); load();
  };
  const remove = async (id) => { await api.delete(`/supervisors/${id}`); load(); };

  return (
    <section className="clean-section">
      <div className="panel-heading">
        <div><span className="eyebrow">SUPERVISOR LOG</span><h3>Dosen pembimbing & piket RSGM</h3></div>
        <button data-testid="add-supervisor-button" className="text-button" onClick={() => setOpen(o => !o)}>
          <Plus size={14} /> Tambah dosen
        </button>
      </div>
      {open && (
        <div className="inline-form" data-testid="supervisor-form">
          <input data-testid="sup-name" placeholder="Nama dosen" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input data-testid="sup-dept" placeholder="Departemen" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
          <select data-testid="sup-piket" value={form.piket_day} onChange={e => setForm({ ...form, piket_day: e.target.value })}>
            {["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"].map(d => <option key={d}>{d}</option>)}
          </select>
          <input data-testid="sup-phone" placeholder="No. HP" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <input data-testid="sup-notes" placeholder="Catatan" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <button data-testid="save-supervisor" className="primary-button" onClick={create}>Simpan</button>
        </div>
      )}
      <div className="sup-list">
        {list.length === 0 && <div className="empty-inline">Belum ada dosen pembimbing tersimpan.</div>}
        {list.map(s => (
          <div className="sup-card" key={s.id} data-testid={`supervisor-${s.id}`}>
            <div className="sup-avatar"><UserCheck size={16} /></div>
            <div className="sup-body">
              <strong>{s.name}</strong>
              <span>{s.department} · Piket {s.piket_day}</span>
              {s.notes && <small>{s.notes}</small>}
            </div>
            <div className="sup-actions">
              {s.phone && <a data-testid={`sup-wa-${s.id}`} href={`https://wa.me/${s.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="whatsapp small">WA</a>}
              <button data-testid={`del-sup-${s.id}`} className="icon-danger" onClick={() => remove(s.id)}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RemindersPanel() {
  const [list, setList] = useState([]);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const load = () => api.get("/reminders").then(r => setList(r.data));
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!text.trim()) return;
    await api.post("/reminders", { text, due, done: false });
    setText(""); setDue(""); load();
  };
  const toggle = async (r) => { await api.patch(`/reminders/${r.id}`, { done: !r.done }); load(); };
  const remove = async (r) => { await api.delete(`/reminders/${r.id}`); load(); };
  return (
    <section className="clean-section">
      <div className="panel-heading">
        <div><span className="eyebrow">TO-DO LIST</span><h3>Reminder harian</h3></div>
      </div>
      <div className="reminder-add">
        <input data-testid="reminder-text" placeholder="Tulis reminder..." value={text} onChange={e => setText(e.target.value)} />
        <input data-testid="reminder-due" type="date" value={due} onChange={e => setDue(e.target.value)} />
        <button data-testid="reminder-add-btn" className="primary-button" onClick={add}><Plus size={14} /> Tambah</button>
      </div>
      <ul className="reminder-list">
        {list.length === 0 && <li className="empty-inline">Belum ada reminder aktif.</li>}
        {list.map(r => (
          <li key={r.id} className={r.done ? "done" : ""} data-testid={`reminder-${r.id}`}>
            <input data-testid={`reminder-check-${r.id}`} type="checkbox" checked={!!r.done} onChange={() => toggle(r)} />
            <div><strong>{r.text}</strong>{r.due && <small>Due {r.due}</small>}</div>
            <button data-testid={`del-reminder-${r.id}`} className="icon-danger" onClick={() => remove(r)}><Trash2 size={13} /></button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const load = () => api.get(`/calendar?month=${ym(cursor)}`).then(r => setEvents(r.data));
  useEffect(() => { load(); }, [ym(cursor)]);

  const year = cursor.getFullYear(), month = cursor.getMonth();
  const dim = daysInMonth(year, month);
  const start = firstDay(year, month);
  const cells = useMemo(() => {
    const arr = [];
    for (let i = 0; i < start; i++) arr.push(null);
    for (let d = 1; d <= dim; d++) arr.push(`${year}-${pad(month + 1)}-${pad(d)}`);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month, dim, start]);

  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach(e => { (map[e.date] = map[e.date] || []).push(e); });
    return map;
  }, [events]);

  const save = async (form) => { await api.post("/calendar", form); load(); };
  const remove = async (id) => { await api.delete(`/calendar/${id}`); load(); };
  const openAdd = (d) => { setSelectedDate(d); setModalOpen(true); };
  const shift = (delta) => setCursor(new Date(year, month + delta, 1));
  const monthLabel = cursor.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  const today = new Date().toISOString().slice(0, 10);
  const dayEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <span className="eyebrow">KALENDER KLINIK</span>
          <h1>Jadwal, bimbingan & deadline ACC</h1>
          <p>Satu tampilan untuk kontrol pasien, jadwal DP, dan reminder harian.</p>
        </div>
        <button data-testid="calendar-add-today" className="primary-button" onClick={() => openAdd(today)}>
          <Plus size={16} /> Agenda hari ini
        </button>
      </div>

      <div className="calendar-layout">
        <section className="clean-section calendar-main">
          <div className="cal-toolbar">
            <button data-testid="cal-prev" className="icon-nav" onClick={() => shift(-1)}><ChevronLeft size={16} /></button>
            <strong data-testid="cal-month-label">{monthLabel}</strong>
            <button data-testid="cal-next" className="icon-nav" onClick={() => shift(1)}><ChevronRight size={16} /></button>
            <button data-testid="cal-today" className="text-button" onClick={() => setCursor(new Date())}>Hari ini</button>
          </div>
          <div className="cal-grid-head">
            {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map(d => <span key={d}>{d}</span>)}
          </div>
          <div className="cal-grid">
            {cells.map((d, i) => (
              <button data-testid={d ? `cal-day-${d}` : `cal-empty-${i}`} className={`cal-cell ${!d ? "empty" : ""} ${d === today ? "today" : ""} ${d === selectedDate ? "on" : ""}`}
                      key={i} disabled={!d} onClick={() => d && setSelectedDate(d)}>
                {d && <span className="cal-day">{Number(d.slice(-2))}</span>}
                {d && (eventsByDate[d] || []).slice(0, 3).map(ev => (
                  <em key={ev.id} className="cal-dot" style={{ background: kindColor[ev.kind] || "#0d9488" }}>{ev.title}</em>
                ))}
                {d && (eventsByDate[d] || []).length > 3 && <em className="cal-more">+{eventsByDate[d].length - 3}</em>}
              </button>
            ))}
          </div>
        </section>

        <section className="clean-section calendar-side">
          <div className="panel-heading">
            <div><span className="eyebrow">DETAIL</span><h3>{selectedDate || "Pilih tanggal"}</h3></div>
            {selectedDate && (
              <button data-testid="add-event-here" className="text-button" onClick={() => setModalOpen(true)}>
                <Plus size={13} /> Tambah
              </button>
            )}
          </div>
          {selectedDate ? (
            dayEvents.length ? dayEvents.map(ev => (
              <div className="ev-row" key={ev.id} data-testid={`ev-${ev.id}`}>
                <i style={{ background: kindColor[ev.kind] }} />
                <div>
                  <strong>{ev.title}</strong>
                  <small>{ev.time || "—"} · {ev.kind}</small>
                  {ev.notes && <p>{ev.notes}</p>}
                </div>
                <button data-testid={`del-ev-${ev.id}`} className="icon-danger" onClick={() => remove(ev.id)}><Trash2 size={14} /></button>
              </div>
            )) : <div className="empty-inline">Tidak ada agenda di tanggal ini.</div>
          ) : <div className="empty-inline">Pilih tanggal untuk melihat detail agenda.</div>}
        </section>
      </div>

      <div className="calendar-bottom">
        <SupervisorPanel />
        <RemindersPanel />
      </div>

      <EventModal open={modalOpen} onClose={() => setModalOpen(false)}
                  initialDate={selectedDate || today}
                  onSave={save} />
    </div>
  );
}
