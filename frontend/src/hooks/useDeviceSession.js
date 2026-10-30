import { useCallback, useEffect, useRef, useState } from "react";
import { publicApi, errMsg } from "@/lib/api";
import { RealtimeClient } from "@/lib/realtime";
import { detectOS, installationId, canShareScreen, beep } from "@/lib/device";

// Client (device) side of a browser assistance session: screen capture, signalling, WebRTC offer.
export function useDeviceSession(linkToken, soundOn) {
  const [phase, setPhase] = useState("idle");
  const [techName, setTechName] = useState(null);
  const [error, setError] = useState(null);
  const [privacy, setPrivacy] = useState({ on: false, requested: false });
  const [messages, setMessages] = useState([]);
  const [connState, setConnState] = useState("");
  const r = useRef({ stream: null, rt: null, pc: null, sessionId: null, ice: [], token: null, pending: [] });
  const sound = useRef(soundOn);
  sound.current = soundOn;
  const ping = (f) => sound.current && beep(f);

  const emit = (ev, data) => r.current.rt?.emit(ev, { session_id: r.current.sessionId, ...data });

  const teardown = useCallback(() => {
    const s = r.current;
    s.stream?.getTracks().forEach((t) => t.stop());
    s.pc?.close();
    s.rt?.close();
    Object.assign(s, { stream: null, pc: null, rt: null, sessionId: null });
  }, []);

  const startPeer = async (iceRestart = false) => {
    const s = r.current;
    if (!s.stream || !s.sessionId) return;
    if (!iceRestart || !s.pc) {
      s.pc?.close();
      const pc = new RTCPeerConnection({ iceServers: s.ice });
      s.pc = pc;
      s.pending = [];
      s.stream.getTracks().forEach((t) => {
        const sender = pc.addTrack(t, s.stream);
        const p = sender.getParameters();
        p.degradationPreference = "balanced";
        sender.setParameters(p).catch(() => {});
      });
      pc.onicecandidate = (e) => e.candidate && emit("webrtc:ice-candidate", { candidate: e.candidate });
      pc.onconnectionstatechange = () => {
        setConnState(pc.connectionState);
        emit("session:status", { connection_state: pc.connectionState });
        if (pc.connectionState === "failed") setTimeout(() => startPeer(true), 1500);
      };
    }
    const offer = await s.pc.createOffer({ iceRestart });
    await s.pc.setLocalDescription(offer);
    emit("webrtc:offer", { sdp: s.pc.localDescription });
    const st = s.stream.getVideoTracks()[0]?.getSettings() || {};
    emit("session:status", { resolution: st.width ? `${st.width}x${st.height}` : null });
  };

  const bind = (rt) => {
    const s = r.current;
    rt.on("connected", ({ session }) => {
      if (session) {
        s.sessionId = session.id;
        setTechName(session.technician_name);
        setPhase(session.status === "active" ? "active" : "assigned");
      }
    });
    rt.on("support:assigned", ({ session }) => {
      s.sessionId = session.id;
      setTechName(session.technician_name);
      setPhase("assigned");
      ping(660);
    });
    rt.on("session:transferred", ({ session }) => {
      s.sessionId = session.id;
      setTechName(session.technician_name);
      setPhase("assigned");
    });
    rt.on("support:rejected", () => {
      s.sessionId = null;
      setTechName(null);
      setPhase("waiting");
    });
    rt.on("session:started", ({ session }) => {
      s.sessionId = session.id;
      setPhase("active");
      emit("consent:update", { screen: true, control: false });
      ping(880);
    });
    rt.on("technician:joined", ({ session_id, technician_name }) => {
      s.sessionId = session_id;
      setTechName(technician_name);
      setPhase("active");
      startPeer().catch(() => setError("Falha ao iniciar a transmissão."));
    });
    rt.on("webrtc:answer", async ({ sdp }) => {
      if (!s.pc) return;
      await s.pc.setRemoteDescription(sdp);
      for (const c of s.pending) await s.pc.addIceCandidate(c).catch(() => {});
      s.pending = [];
    });
    rt.on("webrtc:ice-candidate", ({ candidate }) => {
      if (!s.pc || !candidate) return;
      if (s.pc.remoteDescription) s.pc.addIceCandidate(candidate).catch(() => {});
      else s.pending.push(candidate);
    });
    rt.on("privacy:enabled", () => setPrivacy({ on: true, requested: false }));
    rt.on("privacy:disabled", () => setPrivacy({ on: false, requested: false }));
    rt.on("privacy:disable-requested", () => setPrivacy((p) => ({ ...p, requested: true })));
    rt.on("chat:message", (m) => {
      setMessages((list) => [...list, m]);
      if (m.from === "user") ping(520);
    });
    rt.on("session:ended", () => {
      teardown();
      setPhase("ended");
      setPrivacy({ on: false, requested: false });
      ping(330);
    });
    rt.on("support:cancelled", () => {
      teardown();
      setPhase("ended");
    });
  };

  const connect = async () => {
    setError(null);
    if (!canShareScreen()) {
      setPhase("unsupported");
      return;
    }
    setPhase("picking");
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
    } catch {
      setPhase("idle");
      setError("A partilha de ecrã não foi autorizada. Carregue em CONECTAR para tentar de novo.");
      return;
    }
    const s = r.current;
    s.stream = stream;
    stream.getVideoTracks()[0].onended = () => end();
    setPhase("registering");
    try {
      const os = detectOS();
      const { data } = await publicApi.post("/public/connect", {
        installation_id: installationId(), platform: "web", os: os.os, os_version: os.version,
        link_token: linkToken || null, screen: `${window.screen.width}x${window.screen.height}`,
      });
      s.token = data.device_token;
      const ice = await publicApi.get("/ice-servers", { headers: { Authorization: `Bearer ${data.device_token}`, "x-client-kind": "device" } });
      s.ice = ice.data.iceServers;
      if (data.technician_name) setTechName(data.technician_name);
      setPhase("waiting");
      const rt = new RealtimeClient(async () => `kind=device&token=${encodeURIComponent(s.token)}`);
      s.rt = rt;
      bind(rt);
      rt.connect();
    } catch (e) {
      teardown();
      setPhase("idle");
      setError(errMsg(e, "Não foi possível ligar ao servidor. Verifique a internet."));
    }
  };

  const end = async () => {
    const s = r.current;
    if (s.sessionId) emit("session:end", {});
    else if (s.token) await publicApi.post("/public/cancel", {}, { headers: { Authorization: `Bearer ${s.token}`, "x-client-kind": "device" } }).catch(() => {});
    teardown();
    setPhase("ended");
    setPrivacy({ on: false, requested: false });
  };

  const disablePrivacy = () => emit("privacy:disable", {});
  const sendMessage = (text) => emit("chat:message", { text });
  const reset = () => {
    setPhase("idle");
    setMessages([]);
    setTechName(null);
  };

  useEffect(() => teardown, [teardown]);

  return { phase, techName, error, privacy, messages, connState, connect, end, disablePrivacy, sendMessage, reset };
}
