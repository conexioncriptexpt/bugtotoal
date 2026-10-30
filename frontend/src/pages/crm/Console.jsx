import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Monitor, Pencil, Check, ZoomIn, ZoomOut, Maximize, EyeOff, Eye, Square, Loader2, ChevronLeft, Home, MousePointerClick, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Hand, Layers, Keyboard, MessageSquare, ScanSearch, Sparkles, ListTree, ScrollText } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useCrm, useRt, useLiveLoader } from "@/context/CrmContext";
import { useViewerRtc } from "@/hooks/useViewerRtc";
import { StatusPill, OnlineDot } from "@/components/cc/Status";
import { fmtTime, PLATFORM_LABELS } from "@/lib/format";

const LIVE = ["support:request", "support:assigned", "support:accepted", "support:rejected", "session:ended", "support:cancelled", "device:online", "device:offline", "session:transferred"];
const panel = "cc-card flex flex-col min-h-0";

// Normalised (0-1) point inside the visible video content (handles letterboxing and zoom).
const mapPoint = (e, video) => {
  const r = video.getBoundingClientRect();
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const k = Math.min(r.width / vw, r.height / vh);
  const w = vw * k, h = vh * k;
  const x = (e.clientX - (r.left + (r.width - w) / 2)) / w;
  const y = (e.clientY - (r.top + (r.height - h) / 2)) / h;
  return x < 0 || x > 1 || y < 0 || y > 1 ? null : { x, y };
};

const DeviceCard = ({ item, thumb, active, onOpen, onRenamed }) => {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(item.device_name);
  const save = async (e) => {
    e.stopPropagation();
    try {
      await api.patch(`/devices/${item.device_id}`, { name });
      setEdit(false);
      onRenamed();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  return (
    <div role="button" tabIndex={0} onClick={() => !edit && onOpen(item)} onKeyDown={(e) => e.key === "Enter" && onOpen(item)}
      className={`rounded-xl border p-2 cursor-pointer transition-colors ${active ? "border-[#84CC16] bg-[#84CC16]/5" : "border-[#222736] hover:border-[#84CC16]/50"}`} data-testid={`console-device-${item.device_id}`}>
      <div className="aspect-video bg-black rounded-lg overflow-hidden grid place-items-center">
        {thumb ? <img src={thumb} alt={`Pré-visualização de ${item.device_name}`} className="w-full h-full object-contain" data-testid={`console-thumb-${item.device_id}`} />
          : <span className="text-[11px] text-[#475569] font-mono">{item.device_online ? "A aguardar pré-visualização…" : "Offline"}</span>}
      </div>
      <div className="flex items-center gap-1 mt-2">
        {edit ? (
          <>
            <input autoFocus value={name} onClick={(e) => e.stopPropagation()} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save(e)} className="flex-1 min-w-0 bg-[#0E1017] border border-[#2A3042] rounded px-2 py-1 text-xs" data-testid={`console-rename-input-${item.device_id}`} />
            <button onClick={save} className="cc-btn-lime p-1 rounded" aria-label="Guardar" data-testid={`console-rename-save-${item.device_id}`}><Check size={12} /></button>
          </>
        ) : (
          <>
            <span className="flex-1 min-w-0 truncate text-sm font-medium" data-testid={`console-device-name-${item.device_id}`}>{item.device_name}</span>
            <button onClick={(e) => { e.stopPropagation(); setEdit(true); }} className="p-1 text-[#64748B] hover:text-white" aria-label="Renomear" data-testid={`console-rename-${item.device_id}`}><Pencil size={12} /></button>
          </>
        )}
      </div>
      <div className="flex items-center justify-between text-[11px] text-[#64748B] mt-1">
        <span>{PLATFORM_LABELS[item.platform]} · {item.kind === "session" ? item.technician_name : item.target_technician_name || "Novo"}</span>
        <span className="flex items-center gap-2"><OnlineDot online={item.device_online} label={false} />{item.kind === "session" ? <StatusPill status={item.status} /> : <span className="text-amber-300 font-mono">NOVO</span>}</span>
      </div>
    </div>
  );
};

const DeviceRail = ({ selectedId }) => {
  const nav = useNavigate();
  const [thumbs, setThumbs] = useState({});
  const { data, reload } = useLiveLoader(async () => {
    const [reqs, sess] = await Promise.all([api.get("/requests?status=pending"), api.get("/sessions?status=open")]);
    return [...sess.data.map((s) => ({ ...s, kind: "session", device_id: s.device_id })), ...reqs.data.map((r) => ({ ...r, kind: "request" }))];
  }, LIVE);
  useEffect(() => {
    api.get("/thumbnails").then(({ data: t }) => setThumbs(Object.fromEntries(t.map((x) => [x.device_id, x.image]))));
  }, []);
  useRt("device:thumbnail", (t) => setThumbs((m) => ({ ...m, [t.device_id]: t.image })));
  const open = async (item) => {
    if (item.kind === "session") return nav(`/crm/atendimentos/${item.id}`);
    try {
      const { data: s } = await api.post(`/requests/${item.id}/start`);
      nav(`/crm/atendimentos/${s.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <section className={`${panel} p-3`} data-testid="console-device-rail">
      <h2 className="font-display font-bold px-1 mb-3 flex items-center justify-between">Aparelhos ligados <span className="font-mono text-xs text-[#64748B]">{data?.length ?? 0}</span></h2>
      <div className="flex-1 overflow-y-auto cc-scroll space-y-3 pr-1">
        {!data?.length && <p className="text-sm text-[#64748B] text-center py-10" data-testid="console-rail-empty">Nenhum aparelho ligado de momento.</p>}
        {data?.map((it) => <DeviceCard key={`${it.kind}-${it.id}`} item={it} thumb={thumbs[it.device_id]} active={it.id === selectedId} onOpen={open} onRenamed={reload} />)}
      </div>
    </section>
  );
};

const LiveScreen = ({ s, rtc, live, emit, zoom, setZoom }) => {
  const boxRef = useRef(null);
  const canControl = live && s.platform !== "web" && s.consent?.control;
  const send = (e, type) => {
    if (!canControl) return;
    e.preventDefault();
    const p = mapPoint(e, rtc.videoRef.current);
    if (p) emit("remote:command", { command: { type, ...p } });
  };
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : boxRef.current?.requestFullscreen());
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-1 pb-2 text-xs font-mono text-[#94A3B8]">
        <span data-testid="viewer-resolution">{rtc.stats.width ? `${rtc.stats.width}×${rtc.stats.height}` : s.resolution || "—"} · {Math.round(rtc.stats.fps || 0)} fps · {rtc.pcState}</span>
        <div className="flex items-center gap-1">
          <button className="p-1.5 hover:text-white" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Reduzir" data-testid="remote-zoom-out-button"><ZoomOut size={16} /></button>
          <span className="w-12 text-center" data-testid="viewer-zoom-level">{Math.round(zoom * 100)}%</span>
          <button className="p-1.5 hover:text-white" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Ampliar" data-testid="remote-zoom-in-button"><ZoomIn size={16} /></button>
          <button className="p-1.5 hover:text-white" onClick={fullscreen} aria-label="Ecrã inteiro" data-testid="remote-fullscreen-button"><Maximize size={16} /></button>
        </div>
      </div>
      <div ref={boxRef} className="relative flex-1 bg-black rounded-xl overflow-auto cc-scroll min-h-[45vh]" onDoubleClick={(e) => !canControl && fullscreen(e)} data-testid="remote-screen-viewer">
        <div style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }} className="min-w-full min-h-full">
          <video ref={rtc.videoRef} autoPlay playsInline muted onClick={(e) => send(e, "click")} onDoubleClick={(e) => send(e, "double_click")} onContextMenu={(e) => send(e, s.platform === "android" ? "long_press" : "right_click")}
            className={`w-full h-full object-contain ${canControl ? "cursor-crosshair" : ""}`} data-testid="remote-screen-video" />
        </div>
        {!rtc.hasVideo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[#94A3B8] text-sm" data-testid="viewer-placeholder">
            {s.status === "ended" ? "Sessão terminada." : <><Loader2 className="animate-spin text-[#84CC16]" />{s.device_online ? "A ligar à transmissão…" : "Aparelho offline. A aguardar religação…"}</>}
          </div>
        )}
        {s.privacy && <div className="absolute top-3 left-3 bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded-md" data-testid="viewer-privacy-badge">MODO DE PRIVACIDADE ATIVO NO CLIENTE</div>}
      </div>
      {live && !canControl && <p className="text-xs text-amber-300 mt-2" data-testid="viewer-control-hint">{s.platform === "web" ? "Cliente no navegador: o navegador só permite ver o ecrã. Use as mensagens guiadas." : "O cliente ainda não autorizou o controlo (ou não ativou a acessibilidade no Android)."}</p>}
    </div>
  );
};

const Btn = ({ icon: Icon, label, onClick, id, disabled }) => (
  <button disabled={disabled} onClick={onClick} className="flex flex-col items-center gap-1 py-3 rounded-xl bg-[#0E1017] border border-[#222736] hover:border-[#84CC16]/60 text-xs disabled:opacity-30" data-testid={`cmd-${id}`}><Icon size={16} />{label}</button>
);

const TreeNode = ({ node, depth, onAct }) => (
  <>
    <button onClick={() => node.clickable && onAct(node)} className={`w-full text-left text-xs font-mono px-2 py-1 rounded hover:bg-[#1A1D28] ${node.clickable ? "text-[#A3E635]" : "text-[#94A3B8]"}`} style={{ paddingLeft: 8 + depth * 12 }}>
      {node.cls?.split(".").pop()} {node.text ? `“${node.text}”` : ""} {node.desc ? `[${node.desc}]` : ""} {node.clickable ? "▶" : ""}
    </button>
    {(node.children || []).map((c) => <TreeNode key={c.id} node={c} depth={depth + 1} onAct={onAct} />)}
  </>
);

const ControlPanel = ({ s, live, emit, rtc, tree, messages }) => {
  const [tab, setTab] = useState("cmd");
  const [xy, setXy] = useState({ x: "", y: "" });
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const android = s?.platform === "android";
  const can = live && s.platform !== "web" && s.consent?.control;
  const cmd = (command) => emit("remote:command", { command });
  const [rw, rh] = (rtc.stats.width ? [rtc.stats.width, rtc.stats.height] : (s?.resolution || "0x0").split("x").map(Number));
  const atXY = (type) => rw && cmd({ type, x: Number(xy.x) / rw, y: Number(xy.y) / rh });
  const tabs = [["cmd", "Comandos", Sparkles], ["a11y", "Acessib.", ListTree], ["logs", "Logs", ScrollText]];
  return (
    <section className={`${panel} p-3`} data-testid="console-control-panel">
      <div className="grid grid-cols-3 gap-1 bg-[#0E1017] p-1 rounded-xl mb-4">
        {tabs.map(([k, l, I]) => <button key={k} onClick={() => setTab(k)} className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold ${tab === k ? "bg-[#84CC16] text-black" : "text-[#94A3B8] hover:text-white"}`} data-testid={`console-tab-${k}`}><I size={14} />{l}</button>)}
      </div>
      <div className="flex-1 overflow-y-auto cc-scroll space-y-4 pr-1">
        {!s && <p className="text-sm text-[#64748B] text-center py-10">Selecione um aparelho à esquerda.</p>}
        {s && tab === "cmd" && <>
          <h3 className="text-[11px] font-mono text-[#64748B]">NAVEGAÇÃO</h3>
          <div className="grid grid-cols-3 gap-2">
            <Btn icon={ChevronLeft} label="Voltar" id="back" disabled={!can} onClick={() => cmd(android ? { type: "back" } : { type: "shortcut", keys: "esc" })} />
            <Btn icon={Home} label="Início" id="home" disabled={!can} onClick={() => cmd(android ? { type: "home" } : { type: "shortcut", keys: "win+d" })} />
            <Btn icon={MousePointerClick} label="Clique" id="click" disabled={!can || !xy.x} onClick={() => atXY("click")} />
            <Btn icon={ArrowUp} label="Cima" id="up" disabled={!can} onClick={() => cmd({ type: "scroll", dy: -3 })} />
            <Btn icon={ArrowDown} label="Baixo" id="down" disabled={!can} onClick={() => cmd({ type: "scroll", dy: 3 })} />
            <Btn icon={Hand} label="Longo" id="long" disabled={!can || !xy.x} onClick={() => atXY(android ? "long_press" : "right_click")} />
            <Btn icon={ArrowLeft} label="Esq." id="left" disabled={!can} onClick={() => cmd(android ? { type: "swipe", dx: -3 } : { type: "shortcut", keys: "left" })} />
            <Btn icon={ArrowRight} label="Dir." id="right" disabled={!can} onClick={() => cmd(android ? { type: "swipe", dx: 3 } : { type: "shortcut", keys: "right" })} />
            <Btn icon={Layers} label={android ? "Recentes" : "Alt+Tab"} id="recents" disabled={!can} onClick={() => cmd(android ? { type: "recents" } : { type: "shortcut", keys: "alt+tab" })} />
          </div>
          <h3 className="text-[11px] font-mono text-[#64748B]">COORDENADAS DO CLIQUE (X, Y) · {rw || "?"}×{rh || "?"}</h3>
          <div className="grid grid-cols-2 gap-2">
            <input value={xy.x} onChange={(e) => setXy({ ...xy, x: e.target.value })} placeholder="X" type="number" className="bg-[#0E1017] border border-[#2A3042] rounded-lg px-3 py-2 font-mono text-sm" data-testid="cmd-x-input" />
            <input value={xy.y} onChange={(e) => setXy({ ...xy, y: e.target.value })} placeholder="Y" type="number" className="bg-[#0E1017] border border-[#2A3042] rounded-lg px-3 py-2 font-mono text-sm" data-testid="cmd-y-input" />
          </div>
          <h3 className="text-[11px] font-mono text-[#64748B]">DIGITAR TEXTO NO DISPOSITIVO</h3>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text) { cmd({ type: "text", text }); setText(""); } }}>
            <input value={text} onChange={(e) => setText(e.target.value)} disabled={!can} placeholder="Texto…" className="flex-1 bg-[#0E1017] border border-[#2A3042] rounded-lg px-3 py-2 text-sm" data-testid="cmd-text-input" />
            <button disabled={!can} className="cc-btn-ghost px-3 rounded-lg disabled:opacity-30" aria-label="Enviar texto" data-testid="cmd-text-send"><Keyboard size={16} /></button>
          </form>
          {s.sensitive_focus && <p className="text-xs text-amber-300">Campo sensível em foco: escrita bloqueada.</p>}
          <h3 className="text-[11px] font-mono text-[#64748B]">MENSAGEM GUIADA AO UTILIZADOR</h3>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (msg.trim()) { emit("chat:message", { text: msg.trim() }); setMsg(""); } }}>
            <input value={msg} onChange={(e) => setMsg(e.target.value)} disabled={s.status === "ended"} placeholder="Ex.: Toque no botão verde" className="flex-1 bg-[#0E1017] border border-[#2A3042] rounded-lg px-3 py-2 text-sm" data-testid="viewer-chat-input" />
            <button className="cc-btn-lime px-3 rounded-lg" aria-label="Enviar mensagem" data-testid="viewer-chat-send"><MessageSquare size={16} /></button>
          </form>
        </>}
        {s && tab === "a11y" && (android ? <>
          <button disabled={!can} onClick={() => cmd({ type: "request_tree" })} className="cc-btn-ghost w-full py-2 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-30" data-testid="cmd-request-tree"><ScanSearch size={14} /> Ler interface do ecrã</button>
          {tree ? <div className="border border-[#222736] rounded-lg p-1" data-testid="a11y-tree"><TreeNode node={tree} depth={0} onAct={(n) => cmd({ type: "a11y_action", node_id: n.id, action: "click" })} /></div> : <p className="text-xs text-[#64748B]">Sem leitura ainda.</p>}
        </> : <p className="text-xs text-[#64748B]">A leitura de acessibilidade está disponível na app Android.</p>)}
        {s && tab === "logs" && <div className="space-y-1.5" data-testid="viewer-operations">
          {messages.map((m, i) => <div key={`m${i}`} className="text-xs bg-[#1A1D28] rounded px-2 py-1"><b>{m.from === "device" ? "Cliente" : m.name}</b> {fmtTime(m.at)} — {m.text}</div>)}
          {[...(s.operations || [])].reverse().map((op, i) => <div key={i} className="text-xs"><span className="font-mono text-[#64748B]">{fmtTime(op.at)}</span> <span className="text-[#A3E635]">{op.type}</span> · {op.detail}</div>)}
        </div>}
      </div>
    </section>
  );
};

export default function Console() {
  const { id } = useParams();
  const nav = useNavigate();
  const { member, rt } = useCrm();
  const [s, setS] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [tree, setTree] = useState(null);
  const [messages, setMessages] = useState([]);
  const load = () => (id ? api.get(`/sessions/${id}`).then(({ data }) => setS(data)).catch((e) => { toast.error(errMsg(e)); nav("/crm"); }) : setS(null));
  useEffect(() => { load(); setMessages([]); setTree(null); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = s && s.technician_id === member.id;
  const live = s?.status === "active" && mine;
  const rtc = useViewerRtc(rt, id, !!s && s.status !== "ended");
  const emit = (event, data = {}) => rt?.emit(event, { session_id: id, ...data });
  const mineEv = (d) => d.session_id === id;
  useRt("session:status", (d) => {
    if (!mineEv(d)) return;
    const { device_connected, ...rest } = d;
    setS((x) => (x ? { ...x, ...rest, ...(device_connected !== undefined ? { device_online: device_connected } : {}) } : x));
  });
  useRt("session:operation", (op) => mineEv(op) && setS((x) => (x ? { ...x, operations: [...(x.operations || []), op] } : x)));
  useRt("privacy:enabled", (d) => mineEv(d) && setS((x) => ({ ...x, privacy: true })));
  useRt("privacy:disabled", (d) => mineEv(d) && setS((x) => ({ ...x, privacy: false })));
  useRt("session:started", (d) => mineEv(d) && load());
  useRt("session:ended", (d) => mineEv(d) && load());
  useRt("session:transferred", (d) => mineEv(d) && load());
  useRt("accessibility:tree", (d) => mineEv(d) && setTree(d.tree));
  useRt("chat:message", (m) => mineEv(m) && setMessages((l) => [...l, m]));
  const post = async (path) => {
    try { await api.post(`/sessions/${id}/${path}`); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr_340px] gap-4 xl:h-[calc(100vh-150px)]" data-testid="console-page">
      <DeviceRail selectedId={id} />
      <section className={`${panel} p-4`} data-testid="console-viewer">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-display font-bold flex items-center gap-2"><Monitor size={18} className="text-[#84CC16]" />{s ? s.device_name : "Visualizador ao Vivo"} {s && <StatusPill status={s.status} testId="viewer-status" />}</h2>
          {s && <div className="flex flex-wrap gap-2">
            {mine && s.status === "assigned" && <button className="cc-btn-lime px-3 py-2 rounded-lg text-xs" onClick={() => post("accept")} data-testid="viewer-accept-button">Iniciar atendimento</button>}
            {live && <button onClick={() => emit(s.privacy ? "privacy:disable" : "privacy:enable")} data-testid="remote-privacy-mode-toggle"
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 ${s.privacy ? "bg-amber-500 text-black" : "border-2 border-[#84CC16] text-[#A3E635]"}`}>
              {s.privacy ? <><Eye size={14} /> DESATIVAR MODO DE PRIVACIDADE</> : <><EyeOff size={14} /> ATIVAR MODO DE PRIVACIDADE</>}</button>}
            {s.status !== "ended" && <button className="px-3 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white flex items-center gap-1.5" onClick={() => post("end")} data-testid="viewer-end-button"><Square size={12} /> Terminar</button>}
          </div>}
        </div>
        {s ? <LiveScreen s={s} rtc={rtc} live={live} emit={emit} zoom={zoom} setZoom={setZoom} />
          : <div className="flex-1 bg-black rounded-xl grid place-items-center text-sm font-mono text-[#64748B] min-h-[45vh]" data-testid="viewer-empty">Selecione um aparelho ligado</div>}
      </section>
      <ControlPanel s={s} live={live} emit={emit} rtc={rtc} tree={tree} messages={messages} />
    </div>
  );
}
