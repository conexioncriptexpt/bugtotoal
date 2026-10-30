import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ZoomIn, ZoomOut, Maximize, EyeOff, Eye, Square, Check, X, Loader2 } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useCrm, useRt } from "@/context/CrmContext";
import { useViewerRtc } from "@/hooks/useViewerRtc";
import { StatusPill } from "@/components/cc/Status";
import { shortId } from "@/lib/format";
import { CommandConsole } from "@/pages/crm/viewer/CommandConsole";
import { SidePanel } from "@/pages/crm/viewer/SidePanel";

export default function Viewer() {
  const { id } = useParams();
  const nav = useNavigate();
  const { member, rt } = useCrm();
  const [s, setS] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [tree, setTree] = useState(null);
  const [messages, setMessages] = useState([]);
  const load = () => api.get(`/sessions/${id}`).then(({ data }) => setS(data)).catch((e) => { toast.error(errMsg(e)); nav("/crm/atendimentos"); });
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine = s && s.technician_id === member.id;
  const live = s?.status === "active" && mine;
  const { videoRef, pcState, stats, hasVideo } = useViewerRtc(rt, id, !!s && s.status !== "ended");
  const patch = (d) => d.session_id === id && setS((x) => (x ? { ...x, ...d } : x));

  useRt("session:status", (d) => {
    if (d.session_id !== id) return;
    const { device_connected, ...rest } = d;
    setS((x) => (x ? { ...x, ...rest, ...(device_connected !== undefined ? { device_online: device_connected } : {}) } : x));
  });
  useRt("session:operation", (op) => op.session_id === id && setS((x) => (x ? { ...x, operations: [...(x.operations || []), op] } : x)));
  useRt("privacy:enabled", (d) => patch({ ...d, privacy: true }));
  useRt("privacy:disabled", (d) => patch({ ...d, privacy: false }));
  useRt("session:started", (d) => d.session_id === id && load());
  useRt("session:ended", (d) => d.session_id === id && load());
  useRt("session:transferred", (d) => d.session_id === id && load());
  useRt("accessibility:tree", (d) => d.session_id === id && setTree(d.tree));
  useRt("chat:message", (m) => m.session_id === id && setMessages((l) => [...l, m]));

  const call = async (path, okMsg) => {
    try {
      await api.post(`/sessions/${id}/${path}`);
      if (okMsg) toast.success(okMsg);
      if (path === "reject") nav("/crm/fila");
      else load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const emit = (event, data = {}) => rt?.emit(event, { session_id: id, ...data });

  if (!s) return <div className="text-[#94A3B8]" data-testid="viewer-loading">A carregar sessão…</div>;
  return (
    <div data-testid="viewer-page">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <Link to="/crm/atendimentos" className="cc-btn-ghost p-2 rounded-lg" aria-label="Voltar" data-testid="viewer-back"><ArrowLeft size={18} /></Link>
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-3">{s.device_name} <StatusPill status={s.status} testId="viewer-status" /></h1>
            <p className="text-xs font-mono text-[#64748B]">SESSÃO {shortId(s.id)} · {s.technician_name}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {mine && s.status === "assigned" && <>
            <button className="cc-btn-lime px-4 py-2.5 rounded-lg text-sm flex items-center gap-2" onClick={() => call("accept", "Atendimento iniciado")} data-testid="viewer-accept-button"><Check size={16} /> Aceitar atendimento</button>
            <button className="cc-btn-ghost px-4 py-2.5 rounded-lg text-sm flex items-center gap-2" onClick={() => call("reject")} data-testid="viewer-reject-button"><X size={16} /> Rejeitar</button>
          </>}
          {live && (s.privacy
            ? <button className="px-4 py-2.5 rounded-lg text-sm font-bold bg-amber-500 text-black flex items-center gap-2" onClick={() => emit("privacy:disable")} data-testid="remote-privacy-mode-toggle"><Eye size={16} /> PEDIR DESATIVAÇÃO DO MODO</button>
            : <button className="px-4 py-2.5 rounded-lg text-sm font-bold bg-[#1A1D28] border-2 border-[#84CC16] text-[#A3E635] hover:bg-[#84CC16]/10 flex items-center gap-2" onClick={() => emit("privacy:enable")} data-testid="remote-privacy-mode-toggle"><EyeOff size={16} /> ATIVAR MODO DE PRIVACIDADE</button>)}
          {s.status !== "ended" && <button className="px-4 py-2.5 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-500 text-white flex items-center gap-2" onClick={() => call("end", "Assistência terminada")} data-testid="viewer-end-button"><Square size={14} /> Terminar assistência</button>}
        </div>
      </div>

      <div className="grid xl:grid-cols-[1fr_360px] gap-5">
        <div className="space-y-4 min-w-0">
          <div className="cc-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#222736] text-xs font-mono text-[#94A3B8]">
              <span data-testid="viewer-resolution">{stats.width ? `${stats.width}×${stats.height}` : s.resolution || "—"} · {Math.round(stats.fps || 0)} fps</span>
              <div className="flex items-center gap-1">
                <button className="p-1.5 hover:text-white" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} aria-label="Reduzir" data-testid="remote-zoom-out-button"><ZoomOut size={16} /></button>
                <span className="w-12 text-center" data-testid="viewer-zoom-level">{Math.round(zoom * 100)}%</span>
                <button className="p-1.5 hover:text-white" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Ampliar" data-testid="remote-zoom-in-button"><ZoomIn size={16} /></button>
                <button className="p-1.5 hover:text-white" onClick={() => setZoom(1)} aria-label="Ajustar" data-testid="remote-zoom-fit-button"><Maximize size={16} /></button>
              </div>
            </div>
            <ScreenArea videoRef={videoRef} zoom={zoom} hasVideo={hasVideo} s={s} pcState={pcState} live={live} emit={emit} />
          </div>
          {live && <CommandConsole s={s} emit={emit} tree={tree} />}
        </div>
        <SidePanel s={s} stats={stats} pcState={pcState} messages={messages} onSend={(text) => emit("chat:message", { text })} canChat={s.status !== "ended" && (mine || member.role === "super_admin")} />
      </div>
    </div>
  );
}

const ScreenArea = ({ videoRef, zoom, hasVideo, s, pcState, live, emit }) => {
  const canControl = live && s.platform !== "web" && s.consent?.control;
  const onClick = (e) => {
    if (!canControl) return;
    const r = e.currentTarget.getBoundingClientRect();
    emit("remote:command", { command: { type: "click", x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height } });
  };
  return (
    <div className="relative bg-black h-[52vh] sm:h-[62vh] overflow-auto cc-scroll" data-testid="remote-screen-viewer">
      <div style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }} className="min-w-full min-h-full flex items-center justify-center">
        <video ref={videoRef} autoPlay playsInline muted onClick={onClick} className={`max-w-none w-full h-full object-contain ${canControl ? "cursor-crosshair" : ""}`} data-testid="remote-screen-video" />
      </div>
      {!hasVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6 text-[#94A3B8]" data-testid="viewer-placeholder">
          {s.status === "ended" ? <p>Sessão terminada.</p> : s.status === "assigned" ? <p>Aceite o atendimento para iniciar a transmissão.</p> : (
            <><Loader2 className="animate-spin text-[#84CC16]" /> <p>{s.device_online ? `A aguardar a transmissão do cliente… (${pcState})` : "O dispositivo está offline. A aguardar religação…"}</p></>
          )}
        </div>
      )}
      {s.privacy && <div className="absolute top-3 left-3 bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded-md" data-testid="viewer-privacy-badge">MODO DE PRIVACIDADE ATIVO NO CLIENTE</div>}
    </div>
  );
};
