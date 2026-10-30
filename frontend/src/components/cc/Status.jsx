import { STATUS_LABELS } from "@/lib/format";

const COLORS = {
  pending: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  assigned: "text-sky-300 bg-sky-500/10 border-sky-500/30",
  accepted: "text-sky-300 bg-sky-500/10 border-sky-500/30",
  active: "text-[#A3E635] bg-[#84CC16]/10 border-[#84CC16]/40",
  ended: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  cancelled: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  closed: "text-slate-400 bg-slate-500/10 border-slate-500/30",
};

export const StatusPill = ({ status, testId }) => (
  <span data-testid={testId} className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-mono uppercase tracking-wider ${COLORS[status] || COLORS.ended}`}>
    {STATUS_LABELS[status] || status}
  </span>
);

export const OnlineDot = ({ online, label = true }) => (
  <span className="inline-flex items-center gap-1.5 text-xs">
    <span className="cc-dot" style={{ background: online ? "#22C55E" : "#475569", boxShadow: online ? "0 0 8px #22C55E" : "none" }} />
    {label && <span className={online ? "text-green-400" : "text-slate-500"}>{online ? "Online" : "Offline"}</span>}
  </span>
);

export const PageHeader = ({ title, subtitle, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
    <div>
      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-[#94A3B8] mt-1">{subtitle}</p>}
    </div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

export const Empty = ({ children, testId }) => (
  <div data-testid={testId} className="text-center text-sm text-[#64748B] py-12 border border-dashed border-[#222736] rounded-xl">{children}</div>
);
