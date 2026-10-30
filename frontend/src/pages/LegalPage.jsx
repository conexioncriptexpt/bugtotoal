import { Link } from "react-router-dom";
import { LegalFooter, CONTACT_EMAIL } from "@/components/cc/Legal";

const PRIVACY = [
  ["Quem somos", "Suporte Técnico Avançado é um serviço de assistência técnica remota para pessoas que precisam de ajuda com o telemóvel ou o computador. Responsável: Victor Silva (Rafael Amorim)."],
  ["Que dados tratamos", "Nome do aparelho, sistema operativo, versão, data e hora das sessões, nome do técnico e mensagens trocadas no chat. A imagem do ecrã é transmitida em direto e não é gravada."],
  ["Para que servem", "Exclusivamente para prestar a assistência que pediu e manter um histórico das sessões para segurança e qualidade."],
  ["O seu consentimento", "A partilha do ecrã só começa depois de carregar em CONECTAR e autorizar no seu aparelho. O controlo por toque é opcional e precisa de nova autorização. Pode terminar a qualquer momento."],
  ["Palavras-passe e dados bancários", "Campos de palavra-passe nunca são lidos nem preenchidos pela aplicação. Nunca pedimos palavras-passe, códigos bancários, códigos SMS, dados de cartão nem transferências de dinheiro."],
  ["Conservação e direitos", `Os registos das sessões são guardados apenas o tempo necessário. Pode pedir acesso, correção ou eliminação dos seus dados através de ${CONTACT_EMAIL}, nos termos do RGPD.`],
];

const TERMS = [
  ["Serviço", "Assistência técnica remota, sempre iniciada e autorizada pelo próprio utilizador."],
  ["Utilização proibida", "É proibido usar este serviço para aceder a aparelhos sem autorização do dono, para enganar pessoas, obter dados bancários, palavras-passe ou dinheiro, ou para qualquer atividade ilegal. Contas usadas dessa forma são desativadas e os casos podem ser comunicados às autoridades."],
  ["Técnicos", "Só técnicos autorizados pelo administrador têm acesso ao painel. Todas as ações ficam registadas."],
  ["Controlo do utilizador", "O utilizador vê sempre que a assistência está ativa e pode terminá-la a qualquer momento, na aplicação ou na notificação do sistema."],
  ["Suspeita de fraude", `Se alguém o contactou sem ter pedido ajuda e lhe pediu para instalar esta aplicação, não continue e contacte-nos: ${CONTACT_EMAIL}.`],
];

export default function LegalPage({ kind }) {
  const isPrivacy = kind === "privacy";
  const items = isPrivacy ? PRIVACY : TERMS;
  return (
    <div className="min-h-screen cc-grid-bg flex flex-col" data-testid={`legal-page-${kind}`}>
      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-12 space-y-8">
        <Link to="/" className="text-xs font-mono text-[#84CC16] hover:underline" data-testid="legal-back-link">← Voltar</Link>
        <h1 className="font-display text-4xl sm:text-5xl font-extrabold">{isPrivacy ? "Política de privacidade" : "Termos de utilização"}</h1>
        {items.map(([title, text]) => (
          <section key={title} className="space-y-2">
            <h2 className="font-display text-base md:text-lg font-bold">{title}</h2>
            <p className="text-[#CBD5E1] text-sm md:text-base leading-relaxed">{text}</p>
          </section>
        ))}
      </main>
      <LegalFooter />
    </div>
  );
}
