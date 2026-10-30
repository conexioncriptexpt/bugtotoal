const TZ = "Europe/Lisbon";

const dtf = new Intl.DateTimeFormat("pt-PT", {
  timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});
const df = new Intl.DateTimeFormat("pt-PT", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const tf = new Intl.DateTimeFormat("pt-PT", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export const fmtDateTime = (iso) => (iso ? dtf.format(new Date(iso)).replace(",", "") : "—");
export const fmtDate = (iso) => (iso ? df.format(new Date(iso)) : "—");
export const fmtTime = (iso) => (iso ? tf.format(new Date(iso)) : "—");

export const fmtDuration = (secs) => {
  if (!secs || secs < 0) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h ? `${h}h ${m}min` : m ? `${m}min ${s}s` : `${s}s`;
};

export const sessionDuration = (s) => {
  if (!s?.started_at) return "—";
  const end = s.ended_at ? new Date(s.ended_at) : new Date();
  return fmtDuration((end - new Date(s.started_at)) / 1000);
};

export const shortId = (id) => (id ? id.slice(0, 8).toUpperCase() : "—");

export const STATUS_LABELS = {
  pending: "Pendente", assigned: "Atribuído", accepted: "Aceite", active: "Ativo", ended: "Terminado",
  cancelled: "Cancelado", closed: "Fechado",
};

export const PLATFORM_LABELS = { web: "Navegador", android: "Android", windows: "Windows" };
