import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ChevronRight, Cloud, Package, Settings as SettingsIcon } from "lucide-react";

export default function Settings() {
  const [driveStatus, setDriveStatus] = useState({ connected: false });
  const [integrations, setIntegrations] = useState(null);
  useEffect(() => {
    api.get("/drive/status").then(r => setDriveStatus(r.data)).catch(() => {});
    api.get("/settings/integrations").then(r => setIntegrations(r.data)).catch(() => {});
  }, []);
  const connectDrive = () => api.get("/drive/connect").then(r => window.location.href = r.data.authorization_url);
  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SETTINGS</span>
          <h1>Integrasi & keamanan</h1>
          <p>Kelola koneksi Google Drive, AI, dan penyimpanan media klinis.</p>
        </div>
      </div>
      <section className="clean-section" style={{ marginBottom: 18 }}>
        <div className="panel-heading">
          <div><span className="eyebrow">GOOGLE DRIVE</span><h3>Sinkronisasi folder klinis</h3></div>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
          Foto dan PDF akan tersalin ke folder <b>Dental Coass Tracker</b> pada Google Drive kamu.
        </p>
        {driveStatus.connected ? (
          <div className="pill on" data-testid="drive-connected-pill">Terhubung · {driveStatus.folder_name}</div>
        ) : (
          <button data-testid="connect-google-drive-button" className="google-button compact" onClick={connectDrive}>
            <Cloud size={18} /> Connect to Google Drive <ChevronRight size={16} />
          </button>
        )}
      </section>
      {integrations && (
        <section className="clean-section">
          <div className="panel-heading">
            <div><span className="eyebrow">STATUS INTEGRASI</span><h3>Rangkuman koneksi</h3></div>
          </div>
          <ul className="integration-list">
            <li data-testid="int-drive"><Cloud size={16} /> Google Drive <span className={integrations.google_drive ? "pill on" : "pill off"}>{integrations.google_drive ? "Terhubung" : "Belum"}</span></li>
            <li data-testid="int-storage"><Package size={16} /> Object storage <span className={integrations.storage ? "pill on" : "pill off"}>{integrations.storage ? "Aktif" : "Belum"}</span></li>
            <li data-testid="int-ai"><SettingsIcon size={16} /> Dental AI (Gemini) <span className={integrations.ai ? "pill on" : "pill off"}>{integrations.ai ? "Aktif" : "Belum"}</span></li>
          </ul>
        </section>
      )}
    </div>
  );
}
