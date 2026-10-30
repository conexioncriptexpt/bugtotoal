import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, RefreshCw, Copy } from "lucide-react";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?-_=+";

// Generated locally with crypto.getRandomValues; never sent to the server or stored.
const generate = (len = 24) => {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => CHARS[n % CHARS.length]).join("");
};

export const PasswordGenerator = () => {
  const [pw, setPw] = useState(generate);
  const copy = () => navigator.clipboard?.writeText(pw).then(() => toast.success("Palavra-passe copiada. Cole-a no formulário e guarde-a num gestor de palavras-passe."));
  return (
    <div className="cc-card p-4 w-full max-w-[400px]" data-testid="password-generator">
      <div className="flex items-center gap-2 text-sm font-semibold mb-2"><KeyRound size={16} className="text-[#84CC16]" /> Palavra-passe forte aleatória</div>
      <div className="flex gap-2">
        <code className="flex-1 bg-[#0E1017] border border-[#2A3042] rounded-lg px-3 py-2 text-xs break-all text-[#A3E635]" data-testid="password-generator-value">{pw}</code>
        <button type="button" onClick={() => setPw(generate())} className="cc-btn-ghost px-2 rounded-lg" aria-label="Gerar outra" data-testid="password-generator-refresh"><RefreshCw size={14} /></button>
        <button type="button" onClick={copy} className="cc-btn-lime px-2 rounded-lg" aria-label="Copiar" data-testid="password-generator-copy"><Copy size={14} /></button>
      </div>
      <p className="text-[11px] text-[#64748B] mt-2">Gerada só no seu navegador (24 caracteres). Ninguém mais a vê. Guarde-a antes de criar a conta.</p>
    </div>
  );
};
