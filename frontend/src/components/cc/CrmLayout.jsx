import { NavLink, Outlet, Navigate } from "react-router-dom";
import { Show, UserButton, useClerk } from "@clerk/react";
import { toast } from "sonner";
import { LayoutDashboard, Monitor, Headset, MonitorSmartphone, Link2, Settings, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { CrmProvider, useCrm, useRt, useLiveLoader } from "@/context/CrmContext";
import { api } from "@/lib/api";
import { Wordmark, LisbonClock } from "@/components/cc/Brand";
import { beep } from "@/lib/device";

const NAV = [
  { to: "/crm", label: "Consola ao Vivo", icon: Monitor, end: true, id: "console" },
  { to: "/crm/dashboard", label: "Dashboard", icon: LayoutDashboard, id: "dashboard" },
  { to: "/crm/atendimentos", label: "Atendimentos", icon: Headset, id: "sessions" },
  { to: "/crm/dispositivos", label: "Dispositivos", icon: MonitorSmartphone, id: "devices" },
  { to: "/crm/links", label: "Links de Assistência", icon: Link2, id: "links" },
  { to: "/crm/configuracoes", label: "Configurações", icon: Settings, id: "settings", admin: true },
];

const SideNav = ({ isAdmin }) => (
  <nav className="flex lg:flex-col gap-1 overflow-x-auto cc-scroll">
    {NAV.filter((n) => !n.admin || isAdmin).map(({ to, label, icon: Icon, end, id }) => (
      <NavLink key={to} to={to} end={end} data-testid={`nav-${id}`}
        className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm whitespace-nowrap transition-colors ${isActive ? "bg-[#84CC16]/12 text-[#A3E635] border border-[#84CC16]/30" : "text-[#94A3B8] hover:text-white hover:bg-[#1A1D28] border border-transparent"}`}>
        <Icon size={18} /> {label}
      </NavLink>
    ))}
  </nav>
);

const Notifier = () => {
  const { member } = useCrm();
  useRt("support:request", (r) => {
    beep(990);
    toast.success(`Novo pedido de assistência: ${r.device_name}`, { description: r.target_technician_name ? `Via link de ${r.target_technician_name}` : "Fila global" });
  });
  useRt("support:assigned", ({ session }) => {
    if (session?.technician_id === member?.id) {
      beep(740);
      toast(`Atendimento atribuído: ${session.device_name}`);
    }
  });
  useRt("error", (e) => toast.error(e.message));
  return null;
};

const Counters = () => {
  const { data } = useLiveLoader(() => api.get("/dashboard/stats").then((r) => r.data),
    ["support:request", "support:accepted", "session:ended", "support:cancelled", "device:online", "device:offline"]);
  const items = [["NOVOS", data?.requests_pending, "#F59E0B"], ["ATIVAS", data?.sessions_active, "#84CC16"], ["ONLINE", data?.devices_online, "#3B82F6"]];
  return (
    <div className="hidden md:flex gap-4">
      {items.map(([l, v, c]) => (
        <div key={l} className="text-center leading-tight" data-testid={`header-counter-${l.toLowerCase()}`}>
          <div className="font-mono font-bold" style={{ color: c }}>{v ?? 0}</div>
          <div className="text-[9px] font-mono text-[#64748B]">{l}</div>
        </div>
      ))}
    </div>
  );
};

const Shell = () => {
  const { member, error, isAdmin, rtState } = useCrm();
  const { signOut } = useClerk();
  if (error) {
    return (
      <div className="min-h-screen grid place-items-center cc-grid-bg p-6">
        <div className="cc-card p-8 max-w-md text-center" data-testid="crm-access-denied">
          <ShieldCheck className="mx-auto text-amber-400 mb-3" size={36} />
          <h1 className="font-display text-xl font-bold mb-2">Acesso não autorizado</h1>
          <p className="text-sm text-[#94A3B8] mb-6">{error.message}</p>
          <button className="cc-btn-lime px-5 py-3 rounded-xl" onClick={() => signOut()} data-testid="crm-denied-signout">Terminar sessão</button>
        </div>
      </div>
    );
  }
  if (!member) return <div className="min-h-screen grid place-items-center text-[#94A3B8]" data-testid="crm-loading">A carregar…</div>;
  const live = rtState === "open";
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#0A0B0E]">
      <aside className="lg:w-64 lg:min-h-screen bg-[#0E1017] border-b lg:border-b-0 lg:border-r border-[#222736] p-4 flex lg:flex-col gap-4">
        <div className="hidden lg:block px-2 py-3"><Wordmark /></div>
        <SideNav isAdmin={isAdmin} />
        <div className="hidden lg:block mt-auto px-2 text-[11px] text-[#475569] font-mono">v1.0 · pt-PT</div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-[#222736] flex items-center justify-between px-4 sm:px-8 gap-3 bg-[#0A0B0E]/80 backdrop-blur-xl sticky top-0 z-30">
          <div className="lg:hidden"><Wordmark compact /></div>
          <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-[#64748B]">
            {live ? <Wifi size={14} className="text-green-400" /> : <WifiOff size={14} className="text-amber-400" />}
            <span data-testid="realtime-status">{live ? "TEMPO REAL ATIVO" : "A RELIGAR…"}</span>
          </div>
          <div className="flex items-center gap-3">
            <Counters />
            <LisbonClock />
            <div className="hidden sm:block text-right leading-tight">
              <div className="text-sm font-semibold" data-testid="header-member-name">{member.name}</div>
              <div className="text-[11px] font-mono uppercase text-[#84CC16]" data-testid="header-member-role">{isAdmin ? "Super Admin" : "Técnico"}</div>
            </div>
            <UserButton />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-8 cc-fade-up"><Outlet /></main>
        <footer className="px-8 py-4 border-t border-[#161925] text-[11px] text-[#475569] flex justify-between" data-testid="crm-footer">
          <span>© Crypto Conex</span>
          <span data-testid="crm-footer-credit">Criado por Victor Silva (Rafael Amorim)</span>
        </footer>
      </div>
      <Notifier />
    </div>
  );
};

export default function CrmLayout() {
  return (
    <>
      <Show when="signed-in"><CrmProvider><Shell /></CrmProvider></Show>
      <Show when="signed-out"><Navigate to="/sign-in" replace /></Show>
    </>
  );
}
