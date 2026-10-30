import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const WS_URL = BACKEND_URL.replace(/^http/, "ws");

let tokenGetter = null;
export const setTokenGetter = (fn) => {
  tokenGetter = fn;
};

export const api = axios.create({ baseURL: `${BACKEND_URL}/api` });
api.interceptors.request.use(async (cfg) => {
  if (tokenGetter) {
    const t = await tokenGetter();
    if (t) cfg.headers.Authorization = `Bearer ${t}`;
  }
  return cfg;
});

export const publicApi = axios.create({ baseURL: `${BACKEND_URL}/api` });

export const errMsg = (e, fallback = "Ocorreu um erro. Tente novamente.") => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0]?.msg) return `Dados inválidos: ${d[0].msg}`;
  return fallback;
};
