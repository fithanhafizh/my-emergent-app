import { useState } from "react";
import { API } from "../lib/api";
import { ChevronRight, ClipboardList, ShieldCheck, Sparkles, Stethoscope } from "lucide-react";

export default function AI() {
  const [mode, setMode] = useState("chat");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true); setAnswer(""); setError("");
    try {
      const res = await fetch(`${API}/ai/stream`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, prompt })
      });
      if (!res.ok) throw new Error("AI unavailable");
      const reader = res.body.getReader(); const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value);
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const line of parts) {
          if (line.startsWith("data: ")) {
            const raw = line.slice(6);
            if (raw !== "[DONE]") { try { setAnswer(a => a + JSON.parse(raw).text); } catch {} }
          }
        }
      }
    } catch { setError("Dental AI belum dapat merespons. Coba lagi beberapa saat."); }
    finally { setLoading(false); }
  };

  return (
    <div className="page-wrap ai-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">DENTAL AI ASSISTANT</span>
          <h1>Teman diskusi klinikmu.</h1>
          <p>Gunakan sebagai draft belajar, lalu selalu konfirmasi pada dosen pembimbing.</p>
        </div>
        <div className="ai-badge"><Sparkles size={16} /> Gemini active</div>
      </div>
      <div className="ai-layout">
        <aside className="ai-sidebar clean-section">
          <span className="eyebrow">TOOLS</span>
          {[{ id: "chat", label: "Case discussion", icon: Sparkles },
            { id: "soap", label: "SOAP note", icon: ClipboardList },
            { id: "treatment", label: "Treatment plan", icon: Stethoscope }].map(({ id, label, icon: Icon }) => (
            <button data-testid={`ai-mode-${id}-button`} className={mode === id ? "ai-tool active" : "ai-tool"} key={id} onClick={() => { setMode(id); setAnswer(""); }}>
              <Icon size={18} /><span>{label}</span><ChevronRight size={15} />
            </button>
          ))}
          <div className="ai-disclaimer"><ShieldCheck size={16} /><span>AI membantu belajar, bukan pengganti keputusan klinis.</span></div>
        </aside>
        <section className="ai-workspace clean-section">
          <div className="ai-workspace-head">
            <div className="ai-orb"><Sparkles size={22} /></div>
            <div>
              <strong>{mode === "chat" ? "Case discussion" : mode === "soap" ? "SOAP note generator" : "Treatment plan assistant"}</strong>
              <small>{mode === "treatment" ? "Gemini 3.1 Pro · analisis mendalam" : "Gemini 3 Flash · respons cepat"}</small>
            </div>
          </div>
          {error && <div data-testid="ai-error-message" className="clinical-error">{error}</div>}
          <div className={answer ? "ai-answer" : "ai-answer empty"}>
            {answer ? (<><span className="eyebrow">DRAFT RESPONSE</span><div data-testid="ai-response" className="answer-text">{answer}</div></>)
                    : (<><Sparkles size={28} /><p>Tanyakan sesuatu tentang kasus, bahan, atau bimbingan klinik.</p></>)}
          </div>
          <div className="ai-input-wrap">
            <textarea data-testid="ai-prompt-input" value={prompt} onChange={e => setPrompt(e.target.value)}
                      placeholder={mode === "soap" ? "Contoh: pasien mengeluh ngilu setelah restorasi..." : "Contoh: bagaimana urutan evaluasi kasus ini?"} />
            <button data-testid="ai-submit-button" className="primary-button" disabled={!prompt || loading} onClick={run}>
              {loading ? "Menganalisis..." : "Kirim pertanyaan"}<ChevronRight size={16} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
