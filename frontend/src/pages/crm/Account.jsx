import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { useCrm } from "@/context/CrmContext";
import { PasswordGenerator } from "@/components/cc/PasswordGenerator";

const input = "w-full bg-[#0A0B0E] border border-[#222736] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#84CC16]";

export default function Account() {
  const { member } = useCrm();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const type = show ? "text" : "password";
  const mismatch = confirm && next !== confirm;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/change-password", { current_password: current, new_password: next });
      setToken(data.token);
      setCurrent(""); setNext(""); setConfirm("");
      toast.success("Palavra-passe alterada com sucesso");
    } catch (err) {
      toast.error(errMsg(err, "Não foi possível alterar a palavra-passe."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6" data-testid="account-page">
      <div>
        <h1 className="font-display text-3xl font-bold">A minha conta</h1>
        <p className="text-sm text-[#94A3B8] mt-1" data-testid="account-email">{member?.email}</p>
      </div>
      <form onSubmit={save} className="cc-card p-6 space-y-4" data-testid="change-password-form">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2"><KeyRound size={18} className="text-[#84CC16]" /> Alterar palavra-passe</h2>
        <input type={type} required autoComplete="current-password" placeholder="Palavra-passe atual" className={input}
          value={current} onChange={(e) => setCurrent(e.target.value)} data-testid="current-password-input" />
        <input type={type} required minLength={10} autoComplete="new-password" placeholder="Nova palavra-passe (mín. 10 caracteres)" className={input}
          value={next} onChange={(e) => setNext(e.target.value)} data-testid="new-password-input" />
        <input type={type} required autoComplete="new-password" placeholder="Confirmar nova palavra-passe" className={input}
          value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="confirm-password-input" />
        <button type="button" onClick={() => setShow(!show)} className="flex items-center gap-2 text-sm text-[#94A3B8] hover:text-white" data-testid="account-toggle-password">
          {show ? <EyeOff size={16} /> : <Eye size={16} />} {show ? "Ocultar palavras-passe" : "Mostrar palavras-passe"}
        </button>
        {mismatch && <p className="text-sm text-red-400" data-testid="password-mismatch">As palavras-passe não coincidem.</p>}
        <button type="submit" disabled={busy || next.length < 10 || next !== confirm} className="cc-btn-lime px-5 py-3 rounded-xl disabled:opacity-40" data-testid="change-password-submit">
          {busy ? "A guardar…" : "Guardar nova palavra-passe"}
        </button>
      </form>
      <PasswordGenerator />
    </div>
  );
}
