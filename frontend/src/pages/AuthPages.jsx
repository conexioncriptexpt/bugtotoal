import { SignIn, SignUp } from "@clerk/react";
import { Link } from "react-router-dom";
import { PasswordGenerator } from "@/components/cc/PasswordGenerator";

const Side = () => (
  <div className="hidden lg:flex flex-col justify-between w-[44%] p-12 border-r border-[#222736] bg-[#0E1017]">
    <img src="/logo.png" alt="Crypto Conex — Assistência digital para todos" className="w-full max-w-md mx-auto rounded-2xl" />
    <div>
      <h2 className="font-display text-2xl font-bold">Painel de gestão de assistência</h2>
      <p className="text-[#94A3B8] mt-2 text-sm max-w-sm">Acesso exclusivo a técnicos autorizados. Para criar conta, use o email registado pelo Super Admin.</p>
      <Link to="/" className="inline-block mt-6 text-xs font-mono text-[#84CC16] hover:underline" data-testid="signin-public-link">← Página pública de ligação</Link>
    </div>
  </div>
);

const Frame = ({ children }) => (
  <div className="min-h-screen flex cc-grid-bg">
    <Side />
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
      <img src="/emblem.png" alt="Crypto Conex" className="h-14 lg:hidden" />
      {children}
    </div>
  </div>
);

export const SignInPage = () => (
  <Frame><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" withSignUp /></Frame>
);

export const SignUpPage = () => (
  <Frame>
    <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
    <PasswordGenerator />
  </Frame>
);
