import { useEffect, useRef, useState } from "react";
import "@/App.css";
import { BrowserRouter, useLocation } from "react-router-dom";
import { Activity, CalendarDays, ChevronRight, ClipboardList, FileText, LayoutDashboard, LogOut, Menu, Package, Search, Settings, ShieldCheck, Sparkles, Stethoscope, Users, X } from "lucide-react";
import { api } from "@/lib/api";
import Dashboard from "@/pages/Dashboard";
import Patients from "@/pages/Patients";
import CalendarPage from "@/pages/CalendarPage";
import AI from "@/pages/AI";
import Library from "@/pages/Library";
import Inventory from "@/pages/Inventory";
import SettingsPage from "@/pages/Settings";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "patients", label: "Logbook Pasien", icon: Users },
  { id: "calendar", label: "Kalender & Dosen", icon: CalendarDays },
  { id: "ai", label: "Dental AI", icon: Sparkles },
  { id: "library", label: "SOP & Referensi", icon: FileText },
  { id: "inventory", label: "Dental Kit", icon: Package },
];

function GoogleLogin({ onDone }) {
  const location = useLocation(); const processed = useRef(false);
  useEffect(() => {
    const sid = new URLSearchParams(location.hash.replace(/^#/, "")).get("session_id");
    if (!sid || processed.current) return;
    processed.current = true;
    api.post("/auth/session", { session_id: sid })
       .then(r => { window.history.replaceState({}, "", "/"); onDone(r.data); })
       .catch(() => window.history.replaceState({}, "", "/"));
  }, [location.hash, onDone]);
  return (
    <main className="auth-shell">
      <div className="auth-art">
        <div className="brand-mark"><Stethoscope size={22} /> DENTAL COASS</div>
        <div className="auth-copy">
          <span className="eyebrow">CLINICAL TRACKER · 2026</span>
          <h1>Ruang kerja klinik yang ikut berpikir bersama kamu.</h1>
          <p>Requirement tracker, logbook pasien, odontogram FDI, kalender bimbingan, dan Dental AI—dalam satu workspace.</p>
          <div className="auth-note"><ShieldCheck size={18} /><span>Data tersimpan privat untuk akunmu.</span></div>
        </div>
      </div>
      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="soft-icon"><Activity size={24} /></div>
          <span className="eyebrow">WELCOME BACK, COASS</span>
          <h2>Mulai hari klinikmu.</h2>
          <p>Masuk menggunakan akun Google untuk membuka workspace personalmu.</p>
          <button data-testid="google-sign-in-button" className="google-button"
                  onClick={() => { const redirectUrl = window.location.origin + "/dashboard"; window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`; }}>
            <span className="google-g">G</span> Masuk dengan Google <ChevronRight size={18} />
          </button>
          <small>Dengan masuk, kamu menyetujui penggunaan workspace klinis untuk keperluan pendidikan.</small>
        </div>
      </section>
    </main>
  );
}

function AppContent() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [checking, setChecking] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [deptFilter, setDeptFilter] = useState("");
  const location = useLocation();

  useEffect(() => {
    if (window.location.hash.includes("session_id=")) return;
    api.get("/auth/me").then(r => setUser(r.data)).catch(() => {}).finally(() => setChecking(false));
  }, []);

  if (location.hash.includes("session_id=")) return <GoogleLogin onDone={setUser} />;
  if (checking) return <div className="loading-screen"><div className="loader"></div><span>Menyiapkan workspace klinik...</span></div>;
  if (!user) return <GoogleLogin onDone={setUser} />;

  const logout = () => api.post("/auth/logout").finally(() => setUser(null));

  const renderPage = () => {
    if (page === "dashboard") return <Dashboard setPage={setPage} setDeptFilter={setDeptFilter} />;
    if (page === "patients") return <Patients deptFilter={deptFilter} setDeptFilter={setDeptFilter} />;
    if (page === "calendar") return <CalendarPage />;
    if (page === "ai") return <AI />;
    if (page === "library") return <Library />;
    if (page === "inventory") return <Inventory />;
    if (page === "settings") return <SettingsPage />;
    return null;
  };

  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-symbol"><Stethoscope size={18} /></div>
          <div><strong>Dental Coass</strong><span>Clinical Tracker</span></div>
          <button data-testid="close-menu-button" className="mobile-close" onClick={() => setMobile(false)}><X size={18} /></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} data-testid={`nav-${id}-button`} className={page === id ? "nav-item active" : "nav-item"}
                    onClick={() => { setPage(id); setMobile(false); }}>
              <Icon size={18} /><span>{label}</span>{id === "ai" && <em>AI</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button data-testid="nav-settings-button" className="nav-item" onClick={() => setPage("settings")}>
            <Settings size={18} /><span>Settings</span>
          </button>
          <div className="user-chip">
            <div className="avatar">{user.name?.slice(0, 1) || "D"}</div>
            <div><strong data-testid="signed-in-user-name">{user.name}</strong><small>Koas Klinik</small></div>
            <button data-testid="logout-button" className="icon-button" onClick={logout}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <button data-testid="open-menu-button" className="menu-button" onClick={() => setMobile(true)}><Menu size={20} /></button>
          <div className="crumb"><span>Workspace</span><ChevronRight size={14} /><b>{navItems.find(n => n.id === page)?.label || "Settings"}</b></div>
          <div className="top-actions">
            <div className="search"><Search size={16} /><input data-testid="global-search-input" placeholder="Cari pasien, diagnosis..." /></div>
            <button data-testid="notification-button" className="notification"><Activity size={18} /><i></i></button>
            <div className="top-avatar">{user.name?.slice(0, 1) || "D"}</div>
          </div>
        </header>
        <main className="content">{renderPage()}</main>
      </div>
    </div>
  );
}

export default function App() { return <BrowserRouter><AppContent /></BrowserRouter>; }
