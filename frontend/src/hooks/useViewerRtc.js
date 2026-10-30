import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

// Technician side of the WebRTC session: answers the device offer and collects quality stats.
export function useViewerRtc(rt, sessionId, enabled) {
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const pending = useRef([]);
  const [pcState, setPcState] = useState("new");
  const [stats, setStats] = useState({});
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    if (!rt || !enabled) return undefined;
    const iceP = api.get("/ice-servers").then((r) => r.data.iceServers).catch(() => []);
    const emit = (ev, d) => rt.emit(ev, { session_id: sessionId, ...d });
    const join = () => emit("session:join", {});

    const onOffer = async ({ session_id, sdp }) => {
      if (session_id !== sessionId) return;
      pcRef.current?.close();
      const pc = new RTCPeerConnection({ iceServers: await iceP });
      pcRef.current = pc;
      pc.ontrack = (e) => {
        const v = videoRef.current;
        if (v) {
          v.srcObject = e.streams[0] || new MediaStream([e.track]);
          v.play().catch(() => {});
        }
        setHasVideo(true);
      };
      pc.onicecandidate = (e) => e.candidate && emit("webrtc:ice-candidate", { candidate: e.candidate });
      pc.onconnectionstatechange = () => {
        setPcState(pc.connectionState);
        emit("session:status", { connection_state: pc.connectionState });
      };
      await pc.setRemoteDescription(sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emit("webrtc:answer", { sdp: pc.localDescription });
      for (const c of pending.current) await pc.addIceCandidate(c).catch(() => {});
      pending.current = [];
    };
    const onIce = ({ session_id, candidate }) => {
      if (session_id !== sessionId || !candidate) return;
      const pc = pcRef.current;
      if (pc?.remoteDescription) pc.addIceCandidate(candidate).catch(() => {});
      else pending.current.push(candidate);
    };
    const onStatus = (d) => {
      // only re-join on a device (re)connect broadcast, not on the join reply (which carries "status") -> avoids join loop
      if (d.session_id === sessionId && d.device_connected === true && !("status" in d)) join();
    };
    const offs = [
      rt.on("webrtc:offer", onOffer),
      rt.on("webrtc:ice-candidate", onIce),
      rt.on("session:status", onStatus),
      rt.on("session:started", (d) => d.session_id === sessionId && join()),
      rt.on("_state", (s) => s.state === "open" && join()),
    ];
    join();
    return () => {
      offs.forEach((o) => o());
      pcRef.current?.close();
      pcRef.current = null;
      setHasVideo(false);
    };
  }, [rt, sessionId, enabled]);

  useEffect(() => {
    let last = null;
    const t = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      const report = await pc.getStats();
      const out = {};
      report.forEach((s) => {
        if (s.type === "inbound-rtp" && s.kind === "video") {
          out.fps = s.framesPerSecond || 0;
          out.width = s.frameWidth;
          out.height = s.frameHeight;
          if (last) out.kbps = Math.round(((s.bytesReceived - last.bytes) * 8) / (s.timestamp - last.ts));
          last = { bytes: s.bytesReceived, ts: s.timestamp };
          out.lost = s.packetsLost;
        }
        if (s.type === "candidate-pair" && s.state === "succeeded" && s.nominated) {
          out.rtt = s.currentRoundTripTime ? Math.round(s.currentRoundTripTime * 1000) : undefined;
        }
      });
      setStats(out);
    }, 2000);
    return () => clearInterval(t);
  }, []);

  return { videoRef, pcState, stats, hasVideo };
}
