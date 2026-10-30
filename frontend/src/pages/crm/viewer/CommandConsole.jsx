import { useState } from "react";
import { MousePointerClick, Type, CornerDownLeft, ChevronLeft, Home, Layers, ScanSearch, ArrowUp, ArrowDown } from "lucide-react";

const SHORTCUTS = ["ctrl+c", "ctrl+v", "ctrl+z", "ctrl+a", "alt+tab", "enter", "esc", "tab", "backspace"];

const TreeNode = ({ node, depth, onAct }) => (
  <>
    <button onClick={() => node.clickable && onAct(node)} disabled={!node.clickable}
      className={`w-full text-left text-xs font-mono px-2 py-1 rounded hover:bg-[#1A1D28] disabled:hover:bg-transparent ${node.clickable ? "text-[#A3E635]" : "text-[#94A3B8]"}`}
      style={{ paddingLeft: 8 + depth * 14 }} data-testid={`a11y-node-${node.id}`}>
      {node.cls?.split(".").pop()} {node.text ? `“${node.text}”` : ""} {node.desc ? `[${node.desc}]` : ""} {node.editable ? "✎" : ""} {node.clickable ? "▶" : ""}
    </button>
    {(node.children || []).map((c) => <TreeNode key={c.id} node={c} depth={depth + 1} onAct={onAct} />)}
  </>
);

export const CommandConsole = ({ s, emit, tree }) => {
  const [text, setText] = useState("");
  const send = (command) => emit("remote:command", { command });
  if (s.platform === "web") {
    return (
      <div className="cc-card p-4 text-sm text-[#94A3B8]" data-testid="command-console-web">
        Cliente ligado pelo navegador: o navegador não permite controlo remoto do rato/teclado. Oriente o cliente através das mensagens.
        Para controlo assistido, peça ao cliente para instalar a aplicação Crypto Conex.
      </div>
    );
  }
  if (!s.consent?.control) {
    return <div className="cc-card p-4 text-sm text-amber-300" data-testid="command-console-no-consent">O cliente ainda não autorizou o controlo assistido na aplicação. Os comandos ficam bloqueados até essa autorização.</div>;
  }
  const android = s.platform === "android";
  return (
    <div className="cc-card p-4 space-y-4" data-testid="command-console">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold flex items-center gap-2"><MousePointerClick size={16} className="text-[#84CC16]" /> Consola de comandos</h3>
        <span className="text-[11px] font-mono text-[#64748B]">Clique no ecrã para enviar um clique</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="cc-btn-ghost px-3 py-2 rounded-lg text-xs flex items-center gap-1" onClick={() => send({ type: "scroll", dy: -3 })} data-testid="cmd-scroll-up"><ArrowUp size={14} /> Scroll</button>
        <button className="cc-btn-ghost px-3 py-2 rounded-lg text-xs flex items-center gap-1" onClick={() => send({ type: "scroll", dy: 3 })} data-testid="cmd-scroll-down"><ArrowDown size={14} /> Scroll</button>
        {android && <>
          <button className="cc-btn-ghost px-3 py-2 rounded-lg text-xs flex items-center gap-1" onClick={() => send({ type: "back" })} data-testid="cmd-back"><ChevronLeft size={14} /> Voltar</button>
          <button className="cc-btn-ghost px-3 py-2 rounded-lg text-xs flex items-center gap-1" onClick={() => send({ type: "home" })} data-testid="cmd-home"><Home size={14} /> Início</button>
          <button className="cc-btn-ghost px-3 py-2 rounded-lg text-xs flex items-center gap-1" onClick={() => send({ type: "recents" })} data-testid="cmd-recents"><Layers size={14} /> Recentes</button>
          <button className="cc-btn-ghost px-3 py-2 rounded-lg text-xs flex items-center gap-1" onClick={() => send({ type: "request_tree" })} data-testid="cmd-request-tree"><ScanSearch size={14} /> Ler interface</button>
        </>}
        {!android && SHORTCUTS.map((k) => (
          <button key={k} className="cc-btn-ghost px-3 py-2 rounded-lg text-xs font-mono" onClick={() => send({ type: "shortcut", keys: k })} data-testid={`cmd-shortcut-${k.replace("+", "-")}`}>{k}</button>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text) { send({ type: "text", text }); setText(""); } }}>
        <div className="relative flex-1">
          <Type size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escrever texto (não sensível)…" className="w-full bg-[#0E1017] border border-[#2A3042] rounded-lg pl-9 pr-3 py-2 text-sm" data-testid="cmd-text-input" />
        </div>
        <button className="cc-btn-lime px-4 rounded-lg text-sm flex items-center gap-1" data-testid="cmd-text-send"><CornerDownLeft size={14} /> Enviar</button>
      </form>
      {s.sensitive_focus && <p className="text-xs text-amber-300" data-testid="cmd-sensitive-warning">Campo sensível em foco no cliente: a escrita está bloqueada.</p>}
      {android && tree && (
        <div className="border border-[#222736] rounded-lg max-h-64 overflow-y-auto cc-scroll p-1" data-testid="a11y-tree">
          <TreeNode node={tree} depth={0} onAct={(n) => send({ type: "a11y_action", node_id: n.id, action: "click" })} />
        </div>
      )}
    </div>
  );
};
