import { SafetyNotice, LegalFooter } from "@/components/cc/Legal";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { MonitorUp, Download, ShieldCheck, PhoneOff, Volume2, VolumeX, Loader2, CheckCircle2, MessageCircle, Send } from "lucide-react";
import { publicApi } from "@/lib/api";
import { detectOS } from "@/lib/device";
import { useDeviceSession } from "@/hooks/useDeviceSession";

const PHASE_TEXT = {
  picking: "Escolha o ecrã que quer mostrar…",
  registering: "A ligar ao servidor…",
  waiting: "Pedido enviado. A aguardar um técnico…",
  assigned: "Um técnico vai atender-te dentro de momentos…",
  active: "Assistência ativa",
};

const PrivacyOverlay = ({ onEnd }) => (
  <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-8 p-6 text-center" role="alertdialog" aria-live="assertive" data-testid="client-privacy-overlay">
    <Loader2 className="animate-spin text-[#84CC16]" size={56} />
    <p className="font-display text-3xl sm:text-4xl font-black">Ajuste Técnico — Aguarde...</p>
    <p className="text-[#94A3B8] max-w-md">O técnico está a fazer um ajuste. Este ecrã desaparece quando ele terminar.</p>
    <button onClick={onEnd} className="bg-red-600 hover:bg-red-500 text-white font-bold text-xl px-8 py-5 rounded-2xl" data-testid="client-privacy-end-button">TERMINAR ASSISTÊNCIA</button>
  </div>
);

const Chat = ({ messages, onSend }) => {
  const [text, setText] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (text.trim()) onSend(text.trim());
    setText("");
  };
  return (
    <div className="cc-card p-4 w-full max-w-md text-left" data-testid="client-chat">
      <div className="flex items-center gap-2 text-sm text-[#94A3B8] mb-2"><MessageCircle size={16} /> Mensagens do técnico</div>
      <div className="max-h-40 overflow-y-auto cc-scroll space-y-2 mb-3" aria-live="polite">
        {messages.length === 0 && <p className="text-xs text-[#64748B]">Ainda não há mensagens.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`text-sm px-3 py-2 rounded-lg ${m.from === "user" ? "bg-[#1A1D28]" : "bg-[#84CC16]/15 text-[#D9F99D]"}`}>
            <span className="font-semibold">{m.from === "user" ? m.name : "Tu"}: </span>{m.text}
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreve aqui…" aria-label="Mensagem" className="flex-1 bg-[#0E1017] border border-[#2A3042] rounded-lg px-3 py-3 text-base" data-testid="client-chat-input" />
        <button className="cc-btn-lime px-4 rounded-lg" aria-label="Enviar" data-testid="client-chat-send"><Send size={18} /></button>
      </form>
    </div>
  );
};

export default function ConnectPage() {
  const { token } = useParams();
  const os = detectOS();
  const [cfg, setCfg] = useState({});
  const [link, setLink] = useState(null);
  const [soundOn, setSoundOn] = useState(true);
  const s = useDeviceSession(token, soundOn);

  useEffect(() => {
    publicApi.get("/public/config").then(({ data }) => setCfg(data)).catch(() => {});
    if (token) publicApi.get(`/public/link/${token}`).then(({ data }) => setLink(data)).catch(() => setLink({ valid: false }));
  }, [token]);

  const downloadUrl = os.key === "android" ? cfg.android_download_url : cfg.windows_download_url;
  const downloadLabel = os.key === "android" ? "Aplicação Android" : "Suporte Técnico Avançado (Windows)";
  const busy = ["picking", "registering", "waiting", "assigned", "active"].includes(s.phase);

  return (
    <div className="min-h-screen cc-grid-bg flex flex-col">
      <div className="flex justify-end p-4">
        <button onClick={() => setSoundOn(!soundOn)} className="cc-btn-ghost rounded-xl px-4 py-2 text-sm flex items-center gap-2" aria-pressed={soundOn} data-testid="public-sound-toggle">
          {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />} Som {soundOn ? "ligado" : "desligado"}
        </button>
      </div>
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-12 text-center gap-6">
        <img src="/logo.png" alt="Suporte Técnico Avançado" className="h-28 sm:h-36 rounded-2xl cc-fade-up" data-testid="public-header-logo" />
        <div className="cc-fade-up" style={{ animationDelay: "80ms" }}>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight">Bem-vindo ao <span className="text-[#84CC16]">Suporte Técnico Avançado</span></h1>
          <p className="text-lg md:text-xl text-[#CBD5E1] mt-3">Assistência remota para o seu telemóvel ou computador, só com a sua autorização</p>
          {link?.valid && <p className="mt-3 text-sm text-[#A3E635] font-mono" data-testid="public-link-technician">Técnico: {link.technician_name}</p>}
          {link && !link.valid && <p className="mt-3 text-sm text-amber-300" data-testid="public-link-invalid">Este link expirou. Podes pedir ajuda na mesma.</p>}
        </div>

        {!busy && s.phase !== "ended" && (
          <button onClick={s.connect} className="cc-btn-lime w-full max-w-md text-2xl sm:text-3xl font-black py-7 rounded-2xl flex items-center justify-center gap-3 cc-pulse cc-fade-up" style={{ animationDelay: "160ms" }} data-testid="public-connect-button">
            <MonitorUp size={34} /> CONECTAR
          </button>
        )}

        {busy && (
          <div className="cc-card cc-glow p-6 w-full max-w-md flex flex-col items-center gap-4" role="status" aria-live="polite" data-testid="public-session-status">
            {s.phase === "active" ? <span className="cc-dot cc-pulse" style={{ width: 22, height: 22, background: "#84CC16" }} /> : <Loader2 className="animate-spin text-[#84CC16]" size={32} />}
            <p className="font-display text-2xl font-bold" data-testid="public-phase-text">{PHASE_TEXT[s.phase]}</p>
            {s.techName && <p className="text-[#94A3B8]">Técnico: <b className="text-white" data-testid="public-tech-name">{s.techName}</b></p>}
            {s.phase === "active" && <p className="text-sm text-[#A3E635]">O teu ecrã está a ser partilhado. Podes parar quando quiseres.</p>}
            <button onClick={s.end} className="w-full bg-red-600 hover:bg-red-500 text-white text-xl font-black py-5 rounded-2xl flex items-center justify-center gap-3" data-testid="public-end-button">
              <PhoneOff size={26} /> TERMINAR
            </button>
          </div>
        )}

        {s.phase === "active" && <Chat messages={s.messages} onSend={s.sendMessage} />}

        {s.phase === "ended" && (
          <div className="cc-card p-6 w-full max-w-md flex flex-col items-center gap-3" data-testid="public-ended">
            <CheckCircle2 className="text-[#84CC16]" size={40} />
            <p className="font-display text-2xl font-bold">Assistência terminada</p>
            <p className="text-[#94A3B8] text-sm">A partilha de ecrã parou. Obrigado!</p>
            <button onClick={s.reset} className="cc-btn-ghost w-full py-4 rounded-xl text-lg" data-testid="public-restart-button">Voltar ao início</button>
          </div>
        )}

        {s.phase === "unsupported" && (
          <p className="text-amber-300 max-w-md" role="alert" data-testid="public-unsupported">Este navegador não permite partilhar o ecrã. Instala a aplicação com o botão abaixo.</p>
        )}
        {s.error && <p className="text-amber-300 max-w-md" role="alert" data-testid="public-error">{s.error}</p>}

        {!busy && (
          <a href={downloadUrl || "#"} className="cc-btn-ghost w-full max-w-md rounded-2xl py-5 text-lg font-bold flex items-center justify-center gap-3" data-testid="public-download-app-button" aria-label={`Descarregar ${downloadLabel}`}>
            <Download size={24} /> DESCARREGAR APLICAÇÃO
          </a>
        )}
        {!busy && <p className="text-xs text-[#64748B] -mt-3 font-mono" data-testid="public-detected-os">Sistema detetado: {os.os} {os.version} · {downloadLabel}</p>}

        <div className="flex items-start gap-3 max-w-md text-left bg-[#12141C] border border-[#222736] rounded-xl p-4" data-testid="public-privacy-note">
          <ShieldCheck className="text-[#84CC16] shrink-0" size={22} />
          <p className="text-sm text-[#CBD5E1]">A tua privacidade é importante. A partilha do ecrã só começa depois da tua autorização. A imagem não é gravada.</p>
        </div>
        <SafetyNotice />
      </main>
      <LegalFooter />
      {s.privacy.on && <PrivacyOverlay onEnd={s.end} />}
    </div>
  );
}
