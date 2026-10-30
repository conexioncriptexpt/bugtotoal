import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Copy, Ban } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errMsg } from "@/lib/api";
import { useCrm, useLiveLoader } from "@/context/CrmContext";
import { PageHeader, Empty } from "@/components/cc/Status";
import { fmtDateTime } from "@/lib/format";

const VALIDITY = [["1", "1 dia"], ["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"], ["0", "Sem validade"]];

const CreateForm = ({ isAdmin, onCreated }) => {
  const [techs, setTechs] = useState([]);
  const [tech, setTech] = useState("");
  const [days, setDays] = useState("30");
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (isAdmin) api.get("/technicians").then(({ data }) => setTechs(data.filter((t) => t.active)));
  }, [isAdmin]);
  const create = async () => {
    try {
      const { data } = await api.post("/links", { technician_id: tech || null, expires_in_days: Number(days), label });
      await navigator.clipboard?.writeText(data.url).catch(() => {});
      toast.success("Link criado e copiado", { description: data.url });
      setLabel("");
      onCreated();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div className="cc-card p-5 mb-6 grid sm:grid-cols-[1fr_1fr_160px_auto] gap-3 items-end" data-testid="link-create-form">
      {isAdmin ? (
        <div><label className="text-xs text-[#64748B]">Técnico</label>
          <Select value={tech} onValueChange={setTech}>
            <SelectTrigger className="mt-1" data-testid="link-tech-select"><SelectValue placeholder="A minha conta" /></SelectTrigger>
            <SelectContent>{techs.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      ) : <div className="text-sm text-[#94A3B8]">O link fica associado à sua conta.</div>}
      <div><label className="text-xs text-[#64748B]">Etiqueta (opcional)</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Clientes de Lisboa" className="mt-1 w-full bg-[#0E1017] border border-[#2A3042] rounded-lg px-3 py-2 text-sm" data-testid="link-label-input" />
      </div>
      <div><label className="text-xs text-[#64748B]">Validade</label>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="mt-1" data-testid="link-validity-select"><SelectValue /></SelectTrigger>
          <SelectContent>{VALIDITY.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <button className="cc-btn-lime px-5 py-2.5 rounded-lg text-sm flex items-center gap-2" onClick={create} data-testid="support-link-create-button"><Plus size={16} /> Gerar link</button>
    </div>
  );
};

export default function Links() {
  const { isAdmin } = useCrm();
  const { data, reload } = useLiveLoader(() => api.get("/links").then((r) => r.data), ["support:request"]);
  const revoke = async (l) => {
    try {
      await api.post(`/links/${l.id}/revoke`);
      toast("Link revogado");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const copy = (url) => navigator.clipboard?.writeText(url).then(() => toast.success("Link copiado"));
  return (
    <div data-testid="links-page">
      <PageHeader title="Links de Assistência" subtitle="O link apenas identifica o técnico. A partilha de ecrã depende sempre da autorização do cliente." />
      <CreateForm isAdmin={isAdmin} onCreated={reload} />
      {!data?.length ? <Empty testId="links-empty">Ainda não existem links.</Empty> : (
        <div className="cc-card overflow-x-auto cc-scroll">
          <table className="cc-table w-full" data-testid="links-table">
            <thead><tr><th>Link</th><th>Técnico</th><th>Etiqueta</th><th>Estado</th><th>Validade</th><th>Utilizações</th><th>Último uso</th><th></th></tr></thead>
            <tbody>
              {data.map((l) => (
                <tr key={l.id} data-testid={`link-row-${l.id}`} className={l.valid ? "" : "opacity-50"}>
                  <td className="font-mono text-xs text-[#A3E635] max-w-[260px] truncate" data-testid={`link-url-${l.id}`}>{l.url}</td>
                  <td>{l.technician_name}</td>
                  <td className="text-[#94A3B8]">{l.label || "—"}</td>
                  <td className="text-xs font-mono">{l.revoked ? "REVOGADO" : l.valid ? "ATIVO" : "EXPIRADO"}</td>
                  <td className="font-mono text-xs">{l.expires_at ? fmtDateTime(l.expires_at) : "Sem validade"}</td>
                  <td className="font-mono">{l.uses}</td>
                  <td className="font-mono text-xs">{fmtDateTime(l.last_used_at)}</td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <button className="cc-btn-ghost p-2 rounded-lg" onClick={() => copy(l.url)} aria-label="Copiar" data-testid={`link-copy-${l.id}`}><Copy size={14} /></button>
                      {l.valid && <button className="p-2 rounded-lg border-2 border-red-600/40 text-red-300 hover:bg-red-600/20" onClick={() => revoke(l)} aria-label="Revogar" data-testid={`link-revoke-${l.id}`}><Ban size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
