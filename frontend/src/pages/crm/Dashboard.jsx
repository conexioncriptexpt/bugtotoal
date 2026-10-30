import { Link } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MonitorSmartphone, Wifi, Inbox, Headset, UserCheck, UserX, History, Timer } from "lucide-react";
import { api } from "@/lib/api";
import { useCrm, useLiveLoader } from "@/context/CrmContext";
import { PageHeader, StatusPill, OnlineDot, Empty } from "@/components/cc/Status";
import { fmtDateTime, fmtDuration, PLATFORM_LABELS } from "@/lib/format";

const LIVE = ["support:request", "support:assigned", "support:accepted", "support:rejected", "session:ended", "support:cancelled", "device:online", "device:offline", "technician:presence"];

const Kpi = ({ icon: Icon, label, value, accent, id }) => (
  <div className={`cc-card p-5 ${accent ? "border-[#84CC16]/40" : ""}`} data-testid={`kpi-${id}`}>
    <div className="flex items-center justify-between text-[#64748B] text-xs font-mono uppercase tracking-wider">{label}<Icon size={16} className={accent ? "text-[#84CC16]" : ""} /></div>
    <div className={`font-display text-3xl font-bold mt-3 ${accent ? "text-[#A3E635]" : ""}`} data-testid={`kpi-${id}-value`}>{value ?? "—"}</div>
  </div>
);

const dayLabel = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export default function Dashboard() {
  const { member } = useCrm();
  const { data: st } = useLiveLoader(() => api.get("/dashboard/stats").then((r) => r.data), LIVE);
  const { data: queue } = useLiveLoader(() => api.get("/requests?status=pending").then((r) => r.data), LIVE);
  const { data: open } = useLiveLoader(() => api.get("/sessions?status=open").then((r) => r.data), LIVE);
  return (
    <div data-testid="dashboard-page">
      <PageHeader title={`Olá, ${member.name.split(" ")[0]}`} subtitle="Visão geral da assistência em tempo real" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi id="devices-total" icon={MonitorSmartphone} label="Dispositivos" value={st?.devices_total} />
        <Kpi id="devices-online" icon={Wifi} label="Ligados agora" value={st?.devices_online} accent />
        <Kpi id="requests-pending" icon={Inbox} label="Pedidos pendentes" value={st?.requests_pending} accent={st?.requests_pending > 0} />
        <Kpi id="sessions-active" icon={Headset} label="Atendimentos ativos" value={st?.sessions_active} />
        <Kpi id="techs-available" icon={UserCheck} label="Técnicos disponíveis" value={st?.technicians_available} />
        <Kpi id="techs-busy" icon={UserX} label="Técnicos ocupados" value={st?.technicians_busy} />
        <Kpi id="sessions-total" icon={History} label="Histórico total" value={st?.sessions_total} />
        <Kpi id="avg-duration" icon={Timer} label="Duração média" value={fmtDuration(st?.avg_duration_seconds)} />
      </div>
      <div className="grid lg:grid-cols-5 gap-6 mt-6">
        <section className="cc-card p-5 lg:col-span-3" data-testid="dashboard-live-queue">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2"><span className="cc-dot" style={{ background: "#84CC16", boxShadow: "0 0 8px #84CC16" }} /> Fila em tempo real</h2>
            <Link to="/crm" className="text-xs font-mono text-[#84CC16] hover:underline" data-testid="dashboard-open-queue">ABRIR CONSOLA →</Link>
          </div>
          {!queue?.length ? <Empty testId="dashboard-queue-empty">Sem pedidos pendentes. Os novos pedidos aparecem aqui de imediato.</Empty> : (
            <ul className="divide-y divide-[#1A1E2B]">
              {queue.slice(0, 6).map((r) => (
                <li key={r.id} className="py-3 flex items-center justify-between gap-3" data-testid={`dashboard-queue-item-${r.id}`}>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.device_name}</div>
                    <div className="text-xs text-[#64748B] font-mono">{PLATFORM_LABELS[r.platform]} · {r.os} · {fmtDateTime(r.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0"><OnlineDot online={r.device_online} /><StatusPill status={r.status} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="cc-card p-5 lg:col-span-2" data-testid="dashboard-usage-chart">
          <h2 className="font-display text-lg font-semibold mb-4">Atendimentos — últimos 7 dias</h2>
          {st?.sessions_per_day?.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={st.sessions_per_day.map((d) => ({ ...d, label: dayLabel(d.day) }))}>
                <XAxis dataKey="label" stroke="#64748B" fontSize={11} />
                <YAxis allowDecimals={false} stroke="#64748B" fontSize={11} width={28} />
                <Tooltip contentStyle={{ background: "#12141C", border: "1px solid #222736", borderRadius: 8 }} cursor={{ fill: "#1A1D28" }} />
                <Bar dataKey="count" name="Atendimentos" fill="#84CC16" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty>Ainda sem atendimentos registados.</Empty>}
        </section>
      </div>
      <section className="cc-card p-5 mt-6" data-testid="dashboard-open-sessions">
        <h2 className="font-display text-lg font-semibold mb-4">Atendimentos em curso</h2>
        {!open?.length ? <Empty>Nenhum atendimento em curso.</Empty> : (
          <div className="flex flex-wrap gap-3">
            {open.map((s) => (
              <Link key={s.id} to={`/crm/atendimentos/${s.id}`} className="cc-card px-4 py-3 hover:border-[#84CC16]/50 transition-colors" data-testid={`dashboard-open-session-${s.id}`}>
                <div className="flex items-center gap-2"><StatusPill status={s.status} /><OnlineDot online={s.device_online} label={false} /></div>
                <div className="font-medium mt-1">{s.device_name}</div>
                <div className="text-xs text-[#64748B]">{s.technician_name}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
