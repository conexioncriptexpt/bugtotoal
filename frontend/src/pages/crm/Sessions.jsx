import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Eye, ArrowRightLeft, Square } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errMsg } from "@/lib/api";
import { useCrm, useLiveLoader } from "@/context/CrmContext";
import { PageHeader, StatusPill, OnlineDot, Empty } from "@/components/cc/Status";
import { TechPickerDialog } from "@/components/cc/TechPicker";
import { fmtDateTime, shortId, sessionDuration, PLATFORM_LABELS } from "@/lib/format";

const LIVE = ["support:assigned", "support:accepted", "support:rejected", "session:ended", "session:transferred", "device:online", "device:offline"];

export default function Sessions() {
  const { isAdmin } = useCrm();
  const [tab, setTab] = useState("open");
  const [transfer, setTransfer] = useState(null);
  const { data, reload } = useLiveLoader(() => api.get(`/sessions?status=${tab}`).then((r) => r.data), LIVE, [tab]);

  const doTransfer = async (techId) => {
    try {
      await api.post(`/sessions/${transfer.id}/transfer`, { technician_id: techId });
      toast.success("Atendimento transferido");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
      throw e;
    }
  };
  const end = async (s) => {
    try {
      await api.post(`/sessions/${s.id}/end`);
      toast("Sessão terminada");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div data-testid="sessions-page">
      <PageHeader title="Atendimentos" subtitle={isAdmin ? "Todas as sessões da plataforma" : "As sessões atribuídas à sua conta"}>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-[#12141C] border border-[#222736]">
            <TabsTrigger value="open" data-testid="sessions-tab-open">Em curso</TabsTrigger>
            <TabsTrigger value="ended" data-testid="sessions-tab-ended">Histórico</TabsTrigger>
            <TabsTrigger value="all" data-testid="sessions-tab-all">Todos</TabsTrigger>
          </TabsList>
        </Tabs>
      </PageHeader>
      {!data?.length ? <Empty testId="sessions-empty">Sem atendimentos nesta vista.</Empty> : (
        <div className="cc-card overflow-x-auto cc-scroll">
          <table className="cc-table w-full" data-testid="sessions-table">
            <thead><tr><th>Sessão</th><th>Dispositivo</th><th>Técnico</th><th>Estado</th><th>Autorização</th><th>Início</th><th>Fim</th><th>Duração</th><th></th></tr></thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id} data-testid={`session-row-${s.id}`}>
                  <td className="font-mono text-xs text-[#94A3B8]">{shortId(s.id)}</td>
                  <td><div className="font-medium">{s.device_name}</div><div className="text-xs text-[#64748B] flex gap-2 items-center">{PLATFORM_LABELS[s.platform]} {s.status !== "ended" && <OnlineDot online={s.device_online} />}</div></td>
                  <td>{s.technician_name}</td>
                  <td><StatusPill status={s.status} /></td>
                  <td className="text-xs text-[#94A3B8]">Ecrã {s.consent?.screen ? "✓" : "✗"} · Controlo {s.consent?.control ? "✓" : "✗"}</td>
                  <td className="font-mono text-xs">{fmtDateTime(s.started_at)}</td>
                  <td className="font-mono text-xs">{fmtDateTime(s.ended_at)}</td>
                  <td className="font-mono text-xs">{sessionDuration(s)}</td>
                  <td>
                    <div className="flex gap-2 justify-end">
                      <Link to={`/crm/atendimentos/${s.id}`} className="cc-btn-ghost px-3 py-2 rounded-lg text-xs flex items-center gap-1" data-testid={`session-open-${s.id}`}><Eye size={14} /> Abrir</Link>
                      {isAdmin && s.status !== "ended" && <button className="cc-btn-ghost px-3 py-2 rounded-lg text-xs flex items-center gap-1" onClick={() => setTransfer(s)} data-testid={`session-transfer-${s.id}`}><ArrowRightLeft size={14} /> Transferir</button>}
                      {s.status !== "ended" && <button className="px-3 py-2 rounded-lg text-xs bg-red-600/20 text-red-300 border border-red-600/40 hover:bg-red-600/30 flex items-center gap-1" onClick={() => end(s)} data-testid={`session-end-${s.id}`}><Square size={12} /> Terminar</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TechPickerDialog open={!!transfer} onOpenChange={(o) => !o && setTransfer(null)} title="Transferir atendimento"
        description={transfer ? `Atual: ${transfer.technician_name}` : ""} excludeId={transfer?.technician_id} onConfirm={doTransfer} testId="session-transfer" />
    </div>
  );
}
