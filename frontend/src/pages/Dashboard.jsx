import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { CalendarDays, ChevronRight, Sparkles, Users } from "lucide-react";

function Stat({ label, value, detail, accent }) {
  return (
    <div className="stat-block" data-testid={`stat-${label.toLowerCase().replaceAll(" ", "-")}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={accent ? "positive" : ""}>{detail}</small>
    </div>
  );
}

export default function Dashboard({ setPage, setDeptFilter }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/dashboard").then(r => setData(r.data)); }, []);
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
          <h2>Progres per departemen</h2>
        </div>
        <button data-testid="view-all-requirements-button" className="text-button" onClick={() => setPage("patients")}>
          Lihat rekap lengkap <ChevronRight size={16} />
        </button>
      </div>

      <div className="department-grid">
        {data.departments.map((d, i) => (
          <button data-testid={`department-${i}-card`} className="department-card"
                  key={d.name} onClick={() => openDept(d.name)}>
            <div className="dept-top">
              <span>{d.name}</span>
              <b>{d.target ? Math.round((d.done / d.target) * 100) : 0}%</b>
            </div>
            <div className="progress-track">
              <i style={{ width: `${d.target ? (d.done / d.target) * 100 : 0}%` }} />
            </div>
            <div className="dept-bottom">
              <small>{d.done} / {d.target} kasus</small>
              <em className={d.status === "Lulus" ? "done" : d.status === "On Progress" ? "progress" : "idle"}>{d.status}</em>
            </div>
          </button>
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
    </div>
  );
}
