import { useState } from "react";
import { Send } from "lucide-react";
import { OnlineDot } from "@/components/cc/Status";
import { fmtDateTime, fmtTime, sessionDuration, PLATFORM_LABELS } from "@/lib/format";

const Row = ({ k, v, testId }) => (
  <div className="flex justify-between gap-3 py-1.5 text-sm border-b border-[#1A1E2B] last:border-0">
    <span className="text-[#64748B]">{k}</span><span className="text-right truncate" data-testid={testId}>{v ?? "—"}</span>
  </div>
);

const Card = ({ title, children, testId }) => (
  <section className="cc-card p-4" data-testid={testId}>
    <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#64748B] mb-2">{title}</h3>
    {children}
  </section>
);

const quality = (st, pc) => {
  if (pc !== "connected") return { label: pc === "new" ? "Sem ligação" : pc, color: "#F59E0B" };
  if ((st.rtt ?? 0) > 400 || (st.fps ?? 0) < 4) return { label: "Fraca", color: "#EF4444" };
  if ((st.rtt ?? 0) > 150 || (st.fps ?? 0) < 10) return { label: "Média", color: "#F59E0B" };
  return { label: "Boa", color: "#22C55E" };
};

const Chat = ({ messages, onSend, enabled }) => {
  const [text, setText] = useState("");
  return (
    <>
      <div className="max-h-40 overflow-y-auto cc-scroll space-y-1.5 mb-2" data-testid="viewer-chat-list">
        {!messages.length && <p className="text-xs text-[#64748B]">Sem mensagens.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`text-xs px-2 py-1.5 rounded ${m.from === "device" ? "bg-[#84CC16]/12 text-[#D9F99D]" : "bg-[#1A1D28]"}`}>
            <b>{m.from === "device" ? "Cliente" : m.name}</b> <span className="text-[#64748B]">{fmtTime(m.at)}</span><div>{m.text}</div>
          </div>
        ))}
      </div>
      {enabled && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onSend(text.trim()); setText(""); } }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem para o cliente…" className="flex-1 bg-[#0E1017] border border-[#2A3042] rounded-lg px-3 py-2 text-sm" data-testid="viewer-chat-input" />
          <button className="cc-btn-lime px-3 rounded-lg" aria-label="Enviar" data-testid="viewer-chat-send"><Send size={14} /></button>
        </form>
      )}
    </>
  );
};

export const SidePanel = ({ s, stats, pcState, messages, onSend, canChat }) => {
  const q = quality(stats, pcState);
  const d = s.device || {};
  return (
    <aside className="space-y-4" data-testid="viewer-side-panel">
      <Card title="Dispositivo" testId="viewer-device-card">
        <Row k="Nome" v={s.device_name} testId="viewer-device-name" />
        <Row k="Cliente" v={d.client_name || s.client_name || "Não indicado"} />
        <Row k="Plataforma" v={PLATFORM_LABELS[s.platform]} />
        <Row k="Sistema" v={`${d.os || ""} ${d.os_version || ""}`} />
        <Row k="Ecrã" v={s.resolution || d.screen} />
        <Row k="Estado" v={<OnlineDot online={s.device_online} />} />
      </Card>
      <Card title="Sessão" testId="viewer-session-card">
        <Row k="Técnico" v={s.technician_name} testId="viewer-technician" />
        <Row k="Início" v={fmtDateTime(s.started_at)} />
        <Row k="Fim" v={fmtDateTime(s.ended_at)} />
        <Row k="Duração" v={sessionDuration(s)} />
        <Row k="Autorização ecrã" v={s.consent?.screen ? "Concedida" : "Não concedida"} testId="viewer-consent-screen" />
        <Row k="Autorização controlo" v={s.consent?.control ? "Concedida" : "Não concedida"} testId="viewer-consent-control" />
        <Row k="Privacidade" v={s.privacy ? "Ativo" : "Inativo"} testId="viewer-privacy-state" />
      </Card>
      <Card title="Qualidade da ligação" testId="viewer-quality-card">
        <div className="flex items-center gap-2 mb-1"><span className="cc-dot" style={{ background: q.color }} /><span className="font-semibold" data-testid="viewer-quality-label">{q.label}</span></div>
        <Row k="WebRTC" v={pcState} testId="viewer-pc-state" />
        <Row k="Latência" v={stats.rtt !== undefined ? `${stats.rtt} ms` : "—"} />
        <Row k="Débito" v={stats.kbps ? `${stats.kbps} kbps` : "—"} />
        <Row k="Pacotes perdidos" v={stats.lost ?? "—"} />
      </Card>
      <Card title="Mensagens" testId="viewer-chat-card"><Chat messages={messages} onSend={onSend} enabled={canChat} /></Card>
      <Card title="Histórico de operações" testId="viewer-operations">
        <ul className="max-h-56 overflow-y-auto cc-scroll space-y-1.5">
          {[...(s.operations || [])].reverse().map((op, i) => (
            <li key={i} className="text-xs"><span className="font-mono text-[#64748B]">{fmtTime(op.at)}</span> <span className="text-[#A3E635]">{op.type}</span> · {op.detail}</li>
          ))}
        </ul>
      </Card>
    </aside>
  );
};
