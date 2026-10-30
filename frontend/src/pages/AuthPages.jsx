import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { publicApi, errMsg } from "@/lib/api";
import { getToken, setToken } from "@/lib/auth";

const Side = () => (
  <div className="hidden lg:flex flex-col justify-between w-[44%] p-12 border-r border-[#222736] bg-[#0E1017]">
    <img src="/logo.png" alt="Suporte Técnico Avançado" className="w-full max-w-md mx-auto rounded-2xl" />
    <div>
      <h2 className="font-display text-2xl font-bold">Painel de gestão de assistência</h2>
      <p className="text-[#94A3B8] mt-2 text-sm max-w-sm">Acesso exclusivo a técnicos autorizados pelo Super Admin.</p>
      <Link to="/" className="inline-block mt-6 text-xs font-mono text-[#84CC16] hover:underline" data-testid="signin-public-link">← Página pública de ligação</Link>
    </div>
  </div>
);

const input = "w-full bg-[#0A0B0E] border border-[#222736] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#84CC16]";

const LoginForm = () => {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await publicApi.post("/auth/login", { email: email.trim(), password });
      setToken(data.token);
      nav("/crm", { replace: true });
    } catch (err) {
      setError(errMsg(err, "Não foi possível entrar."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="cc-card p-8 w-full max-w-sm space-y-4" data-testid="login-form">
      <div>
        <h1 className="font-display text-2xl font-bold">Entrar no CRM</h1>
        <p className="text-sm text-[#94A3B8] mt-1">Use o seu email e palavra-passe.</p>
      </div>
      <input type="email" required autoComplete="username" placeholder="Email" className={input}
        value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email-input" />
      <div className="relative">
        <input type={show ? "text" : "password"} required autoComplete="current-password" placeholder="Palavra-passe"
          className={`${input} pr-12`} value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password-input" />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white"
          aria-label={show ? "Ocultar palavra-passe" : "Mostrar palavra-passe"} data-testid="login-toggle-password">
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && <p className="text-sm text-red-400" role="alert" data-testid="login-error">{error}</p>}
      <button type="submit" disabled={busy} className="cc-btn-lime w-full py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50" data-testid="login-submit-button">
        <LogIn size={18} /> {busy ? "A entrar…" : "Entrar"}
      </button>
    </form>
  );
};

export const SignInPage = () => {
  if (getToken()) return <Navigate to="/crm" replace />;
  return (
    <div className="min-h-screen flex cc-grid-bg">
      <Side />
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <img src="/emblem.png" alt="Suporte Técnico Avançado" className="h-14 rounded-xl lg:hidden" />
        <LoginForm />
      </div>
    </div>
  );
};
