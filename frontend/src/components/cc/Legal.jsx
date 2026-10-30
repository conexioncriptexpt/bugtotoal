import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

export const CONTACT_EMAIL = "garciafinancas0073040@proton.me";

export const SafetyNotice = () => (
  <div className="flex items-start gap-3 max-w-md text-left bg-[#1A1408] border border-amber-500/40 rounded-xl p-4" data-testid="public-safety-notice">
    <ShieldAlert className="text-amber-400 shrink-0" size={22} />
    <div className="text-sm text-[#E2E8F0] space-y-1">
      <p className="font-bold text-amber-300">Aviso de segurança</p>
      <p>Só partilhe o ecrã com um técnico que <b>você próprio contactou</b> e em quem confia.</p>
      <p>Os nossos técnicos <b>nunca</b> pedem palavras-passe, códigos bancários, códigos SMS, dados de cartão nem transferências de dinheiro.</p>
      <p>Pode terminar a assistência a qualquer momento.</p>
    </div>
  </div>
);

export const LegalFooter = () => (
  <footer className="w-full border-t border-[#222736] px-6 py-5 text-xs text-[#94A3B8] flex flex-col sm:flex-row gap-3 sm:justify-between" data-testid="legal-footer">
    <span>© Suporte Técnico Avançado · Serviço de assistência remota com autorização do utilizador</span>
    <nav className="flex gap-4">
      <Link to="/privacidade" className="hover:text-white" data-testid="footer-privacy-link">Privacidade</Link>
      <Link to="/termos" className="hover:text-white" data-testid="footer-terms-link">Termos de utilização</Link>
      <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white" data-testid="footer-contact-link">Contacto</a>
    </nav>
  </footer>
);
