import { useEffect, useState } from "react";

export const Emblem = ({ className = "h-10", testId }) => (
  <img src="/emblem.png" alt="Suporte Técnico Avançado" className={`${className} w-auto rounded-xl object-contain`} data-testid={testId} />
);

export const Wordmark = ({ compact = false }) => (
  <div className="flex items-center gap-3">
    <img src="/emblem.png" alt="" aria-hidden className={`${compact ? "h-8" : "h-10"} rounded-lg`} />
    <div className="leading-none">
      <div className="font-display font-black tracking-tight text-white text-base">SUPORTE TÉCNICO</div>
      <div className="font-display font-black tracking-tight text-[#84CC16] text-base -mt-0.5">AVANÇADO</div>
    </div>
  </div>
);

const clockFmt = new Intl.DateTimeFormat("pt-PT", {
  timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});
const dateFmt = new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric" });

export const LisbonClock = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="inline-flex items-center gap-2 bg-[#1A1D28] border border-[#222736] px-3 py-1.5 rounded-lg font-mono text-xs" data-testid="lisbon-digital-clock" aria-label="Hora de Lisboa">
      <span className="text-[#64748B] hidden sm:inline">LISBOA</span>
      <span className="text-[#94A3B8]">{dateFmt.format(now)}</span>
      <span className="text-[#A3E635] font-semibold tabular-nums">{clockFmt.format(now)}</span>
    </div>
  );
};
