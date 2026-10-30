import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Search, Pencil, Trash2, History } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errMsg } from "@/lib/api";
import { useCrm, useLiveLoader } from "@/context/CrmContext";
import { PageHeader, OnlineDot, Empty, StatusPill } from "@/components/cc/Status";
import { fmtDateTime, shortId, PLATFORM_LABELS } from "@/lib/format";

const OS = [["all", "Todos os sistemas"], ["Windows", "Windows"], ["Android", "Android"], ["macOS", "macOS"], ["Linux", "Linux"], ["iOS", "iOS"]];

const RenameDialog = ({ device, onClose, onDone }) => {
  const [name, setName] = useState(device?.name || "");
  const save = async () => {
    try {
      await api.patch(`/devices/${device.id}`, { name });
      toast.success("Dispositivo renomeado");
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#12141C] border-[#222736]" data-testid="device-rename-dialog">
        <DialogHeader><DialogTitle className="font-display">Renomear dispositivo</DialogTitle></DialogHeader>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-[#0E1017] border border-[#2A3042] rounded-lg px-3 py-2.5" data-testid="device-rename-input" />
        <DialogFooter>
          <button className="cc-btn-ghost px-4 py-2 rounded-lg" onClick={onClose}>Cancelar</button>
          <button className="cc-btn-lime px-4 py-2 rounded-lg disabled:opacity-40" disabled={!name.trim()} onClick={save} data-testid="device-rename-save">Guardar</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const HistoryDialog = ({ device, onClose }) => {
  const { data } = useLiveLoader(() => api.get(`/sessions?device_id=${device.id}`).then((r) => r.data), [], [device.id]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#12141C] border-[#222736] max-w-2xl" data-testid="device-history-dialog">
        <DialogHeader><DialogTitle className="font-display">Histórico — {device.name}</DialogTitle></DialogHeader>
        {!data?.length ? <Empty>Sem sessões registadas.</Empty> : (
          <div className="max-h-96 overflow-y-auto cc-scroll">
            <table className="cc-table w-full">
              <thead><tr><th>Sessão</th><th>Técnico</th><th>Estado</th><th>Início</th><th>Fim</th></tr></thead>
              <tbody>{data.map((s) => (
                <tr key={s.id}><td><Link className="font-mono text-xs text-[#84CC16]" to={`/crm/atendimentos/${s.id}`}>{shortId(s.id)}</Link></td><td>{s.technician_name}</td><td><StatusPill status={s.status} /></td><td className="font-mono text-xs">{fmtDateTime(s.started_at)}</td><td className="font-mono text-xs">{fmtDateTime(s.ended_at)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default function Devices() {
  const { isAdmin } = useCrm();
  const [q, setQ] = useState("");
  const [os, setOs] = useState("all");
  const [status, setStatus] = useState("all");
  const [rename, setRename] = useState(null);
  const [history, setHistory] = useState(null);
  const [del, setDel] = useState(null);
  const params = new URLSearchParams({ q, os_filter: os === "all" ? "" : os, status: status === "all" ? "" : status });
  const { data, reload } = useLiveLoader(() => api.get(`/devices?${params}`).then((r) => r.data), ["device:online", "device:offline", "support:request"], [q, os, status]);

  const remove = async () => {
    try {
      await api.delete(`/devices/${del.id}`);
      toast.success("Dispositivo eliminado do CRM");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setDel(null);
  };

  return (
    <div data-testid="devices-page">
      <PageHeader title="Dispositivos" subtitle="Equipamentos que já estabeleceram uma ligação autorizada" />
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar por nome, cliente ou identificador…" className="w-full bg-[#12141C] border border-[#222736] rounded-lg pl-9 pr-3 py-2.5 text-sm" data-testid="devices-search-input" />
        </div>
        <Select value={os} onValueChange={setOs}>
          <SelectTrigger className="sm:w-52 bg-[#12141C]" data-testid="devices-os-filter"><SelectValue /></SelectTrigger>
          <SelectContent>{OS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-40 bg-[#12141C]" data-testid="devices-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="online">Online</SelectItem><SelectItem value="offline">Offline</SelectItem></SelectContent>
        </Select>
      </div>
      {!data?.length ? <Empty testId="devices-empty">Nenhum dispositivo encontrado.</Empty> : (
        <div className="cc-card overflow-x-auto cc-scroll">
          <table className="cc-table w-full" data-testid="devices-table">
            <thead><tr><th>Dispositivo</th><th>Identificador</th><th>Sistema</th><th>Estado</th><th>1.º contacto</th><th>Última ligação</th><th>Último técnico</th><th>Sessões</th><th></th></tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} data-testid={`device-row-${d.id}`}>
                  <td><div className="font-medium" data-testid={`device-name-${d.id}`}>{d.name}</div><div className="text-xs text-[#64748B]">{d.client_name}</div></td>
                  <td className="font-mono text-xs text-[#94A3B8]">{shortId(d.id)}</td>
                  <td>{d.os} {d.os_version}<div className="text-xs text-[#64748B]">{PLATFORM_LABELS[d.platform]}</div></td>
                  <td><OnlineDot online={d.online} /></td>
                  <td className="font-mono text-xs">{fmtDateTime(d.first_seen)}</td>
                  <td className="font-mono text-xs">{fmtDateTime(d.last_seen)}</td>
                  <td>{d.last_technician_name || "—"}</td>
                  <td className="font-mono">{d.sessions_count}</td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <button className="cc-btn-ghost p-2 rounded-lg" onClick={() => setHistory(d)} aria-label="Histórico" data-testid={`device-history-${d.id}`}><History size={14} /></button>
                      <button className="cc-btn-ghost p-2 rounded-lg" onClick={() => setRename(d)} aria-label="Renomear" data-testid={`device-rename-${d.id}`}><Pencil size={14} /></button>
                      {isAdmin && <button className="p-2 rounded-lg border-2 border-red-600/40 text-red-300 hover:bg-red-600/20" onClick={() => setDel(d)} aria-label="Eliminar" data-testid={`device-delete-${d.id}`}><Trash2 size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rename && <RenameDialog device={rename} onClose={() => setRename(null)} onDone={reload} />}
      {history && <HistoryDialog device={history} onClose={() => setHistory(null)} />}
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent className="bg-[#12141C] border-[#222736]" data-testid="device-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar “{del?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>O registo do dispositivo é removido do CRM. O histórico de sessões mantém-se.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="device-delete-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-500" onClick={remove} data-testid="device-delete-confirm">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
