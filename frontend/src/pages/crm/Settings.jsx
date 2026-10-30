import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, KeyRound, Activity } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { api, errMsg } from "@/lib/api";
import { useCrm, useLiveLoader } from "@/context/CrmContext";
import { PageHeader, OnlineDot, Empty, StatusPill } from "@/components/cc/Status";
import { fmtDateTime, shortId } from "@/lib/format";

const PERMS = [["control", "Controlo assistido"], ["privacy", "Modo de privacidade"], ["accessibility", "Leitura de acessibilidade"]];
const input = "w-full bg-[#0E1017] border border-[#2A3042] rounded-lg px-3 py-2.5 text-sm";

const TechDialog = ({ tech, onClose, onDone }) => {
  const editing = !!tech?.id;
  const [f, setF] = useState({ name: tech?.name || "", email: tech?.email || "", role: tech?.role || "technician", permissions: tech?.permissions || { control: true, privacy: true, accessibility: true } });
  const save = async () => {
    try {
      if (editing) await api.patch(`/technicians/${tech.id}`, { name: f.name, role: f.role, permissions: f.permissions });
      else await api.post("/technicians", f);
      toast.success(editing ? "Perfil atualizado" : "Perfil criado. O técnico deve registar-se com este email.");
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#12141C] border-[#222736]" data-testid="tech-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">{editing ? "Editar perfil" : "Novo técnico"}</DialogTitle>
          {!editing && <DialogDescription>Depois de criado, o técnico regista-se em /sign-up com este email e define a própria palavra-passe.</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          <input className={input} placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="tech-name-input" />
          <input className={input} placeholder="Email" type="email" value={f.email} disabled={editing} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="tech-email-input" />
          <div className="flex gap-2">
            {[["technician", "Técnico"], ["super_admin", "Super Admin"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setF({ ...f, role: v })} className={`flex-1 py-2 rounded-lg text-sm border-2 ${f.role === v ? "border-[#84CC16] text-[#A3E635]" : "border-[#2A3042] text-[#94A3B8]"}`} data-testid={`tech-role-${v}`}>{l}</button>
            ))}
          </div>
          {PERMS.map(([k, l]) => (
            <label key={k} className="flex items-center justify-between text-sm py-1">{l}
              <Switch checked={!!f.permissions[k]} onCheckedChange={(v) => setF({ ...f, permissions: { ...f.permissions, [k]: v } })} data-testid={`tech-perm-${k}`} />
            </label>
          ))}
        </div>
        <DialogFooter>
          <button className="cc-btn-ghost px-4 py-2 rounded-lg" onClick={onClose}>Cancelar</button>
          <button className="cc-btn-lime px-4 py-2 rounded-lg" onClick={save} data-testid="tech-save-button">Guardar</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const PasswordDialog = ({ tech, onClose }) => {
  const [pw, setPw] = useState("");
  const save = async () => {
    try {
      await api.post(`/technicians/${tech.id}/password`, { password: pw });
      toast.success("Palavra-passe alterada");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#12141C] border-[#222736]" data-testid="tech-password-dialog">
        <DialogHeader><DialogTitle className="font-display">Alterar palavra-passe — {tech.name}</DialogTitle>
          <DialogDescription>Mínimo 8 caracteres. O técnico também pode usar “Esqueceu-se da palavra-passe?” no início de sessão.</DialogDescription></DialogHeader>
        <input type="password" className={input} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" data-testid="tech-password-input" />
        <DialogFooter><button className="cc-btn-lime px-4 py-2 rounded-lg disabled:opacity-40" disabled={pw.length < 8} onClick={save} data-testid="tech-password-save">Alterar</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ActivityDialog = ({ tech, onClose }) => {
  const [d, setD] = useState(null);
  useEffect(() => { api.get(`/technicians/${tech.id}/activity`).then((r) => setD(r.data)); }, [tech.id]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#12141C] border-[#222736] max-w-2xl" data-testid="tech-activity-dialog">
        <DialogHeader><DialogTitle className="font-display">Atividade — {tech.name}</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto cc-scroll space-y-4">
          <div><h4 className="text-xs font-mono text-[#64748B] mb-2">ATENDIMENTOS ({d?.sessions.length ?? 0})</h4>
            {d?.sessions.map((s) => <div key={s.id} className="text-sm flex justify-between py-1 border-b border-[#1A1E2B]"><span>{s.device_name}</span><span className="flex gap-2 items-center"><StatusPill status={s.status} /><span className="font-mono text-xs">{fmtDateTime(s.created_at)}</span></span></div>)}
          </div>
          <div><h4 className="text-xs font-mono text-[#64748B] mb-2">REGISTO DE AUDITORIA</h4>
            {d?.audit.map((a) => <div key={a.id} className="text-xs py-1"><span className="font-mono text-[#64748B]">{fmtDateTime(a.at)}</span> <span className="text-[#A3E635]">{a.action}</span> {shortId(a.target)}</div>)}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const TechsTab = () => {
  const { member } = useCrm();
  const { data, reload } = useLiveLoader(() => api.get("/technicians").then((r) => r.data), ["technician:presence", "support:accepted", "session:ended"]);
  const [edit, setEdit] = useState(null);
  const [pw, setPw] = useState(null);
  const [act, setAct] = useState(null);
  const [del, setDel] = useState(null);
  const toggle = async (t, active) => {
    try { await api.patch(`/technicians/${t.id}`, { active }); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async () => {
    try { await api.delete(`/technicians/${del.id}`); toast.success("Perfil eliminado"); reload(); } catch (e) { toast.error(errMsg(e)); }
    setDel(null);
  };
  return (
    <>
      <div className="flex justify-end mb-4"><button className="cc-btn-lime px-4 py-2.5 rounded-lg text-sm flex items-center gap-2" onClick={() => setEdit({})} data-testid="technicians-add-button"><Plus size={16} /> Novo técnico</button></div>
      {!data?.length ? <Empty>Sem perfis.</Empty> : (
        <div className="cc-card overflow-x-auto cc-scroll">
          <table className="cc-table w-full" data-testid="technicians-table">
            <thead><tr><th>Nome</th><th>Email</th><th>Perfil</th><th>Conta</th><th>Presença</th><th>Permissões</th><th>Ativo</th><th></th></tr></thead>
            <tbody>{data.map((t) => (
              <tr key={t.id} data-testid={`tech-row-${t.id}`}>
                <td className="font-medium">{t.name}</td>
                <td className="text-[#94A3B8]">{t.email}</td>
                <td className="text-xs font-mono">{t.role === "super_admin" ? "SUPER ADMIN" : "TÉCNICO"}</td>
                <td className="text-xs">{t.linked ? <span className="text-green-400">Registada</span> : <span className="text-amber-300">A aguardar registo</span>}</td>
                <td>{t.busy ? <span className="text-xs text-amber-300">Ocupado</span> : <OnlineDot online={t.online} />}</td>
                <td className="text-xs text-[#94A3B8]">{PERMS.filter(([k]) => t.permissions?.[k]).map(([, l]) => l).join(", ") || "—"}</td>
                <td><Switch checked={t.active} disabled={t.id === member.id} onCheckedChange={(v) => toggle(t, v)} data-testid={`tech-active-${t.id}`} /></td>
                <td><div className="flex gap-1 justify-end">
                  <button className="cc-btn-ghost p-2 rounded-lg" onClick={() => setAct(t)} aria-label="Atividade" data-testid={`tech-activity-${t.id}`}><Activity size={14} /></button>
                  <button className="cc-btn-ghost p-2 rounded-lg" onClick={() => setEdit(t)} aria-label="Editar" data-testid={`tech-edit-${t.id}`}><Pencil size={14} /></button>
                  <button className="cc-btn-ghost p-2 rounded-lg disabled:opacity-30" disabled={!t.linked} onClick={() => setPw(t)} aria-label="Palavra-passe" data-testid={`tech-password-${t.id}`}><KeyRound size={14} /></button>
                  {t.id !== member.id && <button className="p-2 rounded-lg border-2 border-red-600/40 text-red-300 hover:bg-red-600/20" onClick={() => setDel(t)} aria-label="Eliminar" data-testid={`tech-delete-${t.id}`}><Trash2 size={14} /></button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {edit && <TechDialog tech={edit} onClose={() => setEdit(null)} onDone={reload} />}
      {pw && <PasswordDialog tech={pw} onClose={() => setPw(null)} />}
      {act && <ActivityDialog tech={act} onClose={() => setAct(null)} />}
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent className="bg-[#12141C] border-[#222736]">
          <AlertDialogHeader><AlertDialogTitle>Eliminar o perfil de {del?.name}?</AlertDialogTitle>
            <AlertDialogDescription>O técnico perde o acesso ao CRM e os seus links são revogados. O histórico de atendimentos mantém-se.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-500" onClick={remove} data-testid="tech-delete-confirm">Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const SystemTab = () => {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/settings").then((r) => setS(r.data)); }, []);
  const save = async () => {
    try { setS((await api.put("/settings", s)).data); toast.success("Configurações guardadas"); } catch (e) { toast.error(errMsg(e)); }
  };
  if (!s) return null;
  const num = (k, l, hint) => (
    <label className="block"><span className="text-sm">{l}</span>
      <input type="number" className={`${input} mt-1`} value={s[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} data-testid={`settings-${k}`} />
      <span className="text-xs text-[#64748B]">{hint}</span></label>
  );
  return (
    <div className="cc-card p-6 max-w-xl space-y-5" data-testid="settings-system">
      {num("retention_days", "Retenção de dados (dias)", "Registos de auditoria e operações de sessão mais antigos são removidos.")}
      {num("default_link_days", "Validade padrão dos links (dias, 0 = sem validade)", "")}
      {num("max_text_command_length", "Comprimento máximo de texto por comando", "")}
      <label className="flex items-center justify-between text-sm">Feedback sonoro na página pública<Switch checked={s.sound_feedback} onCheckedChange={(v) => setS({ ...s, sound_feedback: v })} data-testid="settings-sound" /></label>
      <button className="cc-btn-lime px-5 py-2.5 rounded-lg text-sm" onClick={save} data-testid="settings-save-button">Guardar</button>
    </div>
  );
};

const AuditTab = () => {
  const { data } = useLiveLoader(() => api.get("/audit").then((r) => r.data), []);
  return (
    <div className="cc-card overflow-x-auto cc-scroll" data-testid="settings-audit">
      <table className="cc-table w-full">
        <thead><tr><th>Data</th><th>Autor</th><th>Ação</th><th>Alvo</th></tr></thead>
        <tbody>{(data || []).map((a) => <tr key={a.id}><td className="font-mono text-xs">{fmtDateTime(a.at)}</td><td>{a.actor}</td><td className="text-[#A3E635] font-mono text-xs">{a.action}</td><td className="font-mono text-xs">{shortId(a.target)}</td></tr>)}</tbody>
      </table>
    </div>
  );
};

export default function SettingsPage() {
  const { isAdmin } = useCrm();
  if (!isAdmin) return <Empty>Apenas o Super Admin tem acesso às configurações.</Empty>;
  return (
    <div data-testid="settings-page">
      <PageHeader title="Configurações" subtitle="Técnicos, permissões, retenção de dados e auditoria" />
      <Tabs defaultValue="techs">
        <TabsList className="bg-[#12141C] border border-[#222736] mb-5">
          <TabsTrigger value="techs" data-testid="settings-tab-techs">Técnicos</TabsTrigger>
          <TabsTrigger value="system" data-testid="settings-tab-system">Sistema</TabsTrigger>
          <TabsTrigger value="audit" data-testid="settings-tab-audit">Auditoria</TabsTrigger>
        </TabsList>
        <TabsContent value="techs"><TechsTab /></TabsContent>
        <TabsContent value="system"><SystemTab /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>
    </div>
  );
}
