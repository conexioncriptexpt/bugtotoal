import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { api, setTokenGetter, errMsg } from "@/lib/api";
import { RealtimeClient } from "@/lib/realtime";

const Ctx = createContext(null);

export function CrmProvider({ children }) {
  const { getToken } = useAuth();
  const [member, setMember] = useState(null);
  const [error, setError] = useState(null);
  const [rt, setRt] = useState(null);
  const [rtState, setRtState] = useState("connecting");
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;

  useEffect(() => {
    setTokenGetter(() => tokenRef.current());
    let client;
    let cancelled = false;
    api.get("/me")
      .then(({ data }) => {
        if (cancelled) return;
        setMember(data);
        client = new RealtimeClient(async () => `kind=user&token=${encodeURIComponent(await tokenRef.current())}`);
        client.on("_state", (s) => setRtState(s.state));
        client.connect();
        setRt(client);
      })
      .catch((e) => !cancelled && setError({ status: e?.response?.status, message: errMsg(e, "Não foi possível carregar a sua conta.") }));
    return () => {
      cancelled = true;
      client?.close();
    };
  }, []);

  return <Ctx.Provider value={{ member, error, rt, rtState, isAdmin: member?.role === "super_admin" }}>{children}</Ctx.Provider>;
}

export const useCrm = () => useContext(Ctx);

export function useRt(event, cb) {
  const { rt } = useCrm();
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!rt) return undefined;
    return rt.on(event, (d) => ref.current(d));
  }, [rt, event]);
}

// Re-run a loader whenever any of the given realtime events fire.
export function useLiveLoader(loader, events, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef(loader);
  ref.current = loader;
  const reload = async () => {
    try {
      setData(await ref.current());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    reload();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  const { rt } = useCrm();
  useEffect(() => {
    if (!rt) return undefined;
    const offs = events.map((e) => rt.on(e, () => reload()));
    return () => offs.forEach((o) => o());
  }, [rt]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, loading, reload, setData };
}
