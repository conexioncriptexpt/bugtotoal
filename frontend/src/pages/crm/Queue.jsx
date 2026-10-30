import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { UserPlus, Hand, X } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useCrm, useLiveLoader } from "@/context/CrmContext";
import { PageHeader, StatusPill, OnlineDot, Empty } from "@/components/cc/Status";
import { TechPickerDialog } from "@/components/cc/TechPicker";
import { fmtDateTime, shortId, PLATFORM_LABELS } from "@/lib/format";

const LIVE = ["support:request", "support:assigned", "support:rejected", "support:cancelled", "device:online", "device:offline"];

export default function Queue() {
  const { isAdmin } = useCrm();
  const nav = useNavigate();
  const [assignFor, setAssignFor] = useState(null);
  const { data, reload } = useLiveLoader(() => api.get("/requests?status=pending").then((r) => r.data), LIVE);

  const assign = async (techId) => {
    try {
      await api.post(`/requests/${assignFor.id}/assign`, { technician_id: techId });
      toast.success("Atendimento atribuído");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
      throw e;
    }
  };
  const take = async (r) => {
    try {
      const { data: s } = await api.post(`/requests/${r.id}/take`);
      nav(`/crm/atendimentos/${s.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const discard = async (r) => {
    try {
      await api.post(`/requests/${r.id}/cancel`);
      toast("Pedido descartado");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div data-testid="queue-page">
      <PageHeader title="Fila de Pedidos" subtitle={isAdmin ? "Fila global — atribua cada pedido a um técnico" : "Pedidos recebidos através dos seus links"} />
      {!data?.length ? <Empty testId="queue-empty">Sem pedidos pendentes. Quando um cliente carregar em CONECTAR, o pedido aparece aqui.</Empty> : (
        <div className="cc-card overflow-x-auto cc-scroll">
          <table className="cc-table w-full" data-testid="queue-table">
            <thead><tr><th>Pedido</th><th>Dispositivo</th><th>Sistema</th><th>Estado</th><th>Destino</th><th>Recebido</th><th></th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} data-testid={`queue-row-${r.id}`}>
                  <td className="font-mono text-xs text-[#94A3B8]">{shortId(r.id)}</td>
                  <td><div className="font-medium">{r.device_name}</div><OnlineDot online={r.device_online} /></td>
                  <td className="text-[#94A3B8]">{PLATFORM_LABELS[r.platform]} · {r.os}</td>
                  <td><StatusPill status={r.status} /></td>
                  <td className="text-[#94A3B8]">{r.target_technician_name || "Fila global"}</td>
                  <td className="font-mono text-xs">{fmtDateTime(r.created_at)}</td>
                  <td>
                    <div className="flex gap-2 justify-end">
                      {isAdmin && <button className="cc-btn-lime px-3 py-2 rounded-lg text-xs flex items-center gap-1" onClick={() => setAssignFor(r)} data-testid={`queue-assign-${r.id}`}><UserPlus size={14} /> Atribuir</button>}
                      <button className="cc-btn-ghost px-3 py-2 rounded-lg text-xs flex items-center gap-1" onClick={() => take(r)} data-testid={`queue-take-${r.id}`}><Hand size={14} /> Atender eu</button>
                      {isAdmin && <button className="cc-btn-ghost px-2 py-2 rounded-lg text-xs" onClick={() => discard(r)} aria-label="Descartar" data-testid={`queue-discard-${r.id}`}><X size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TechPickerDialog open={!!assignFor} onOpenChange={(o) => !o && setAssignFor(null)} title="Atribuir atendimento"
        description={assignFor ? `Pedido de ${assignFor.device_name}` : ""} onConfirm={assign} testId="queue-assign" />
    </div>
  );
}
