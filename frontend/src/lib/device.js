export function detectOS() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return { os: "Android", version: (ua.match(/Android\s([\d.]+)/) || [])[1] || "", key: "android" };
  if (/iPhone|iPad|iPod/i.test(ua)) return { os: "iOS", version: ((ua.match(/OS (\d+[_\d]*)/) || [])[1] || "").replace(/_/g, "."), key: "ios" };
  if (/Windows NT/i.test(ua)) {
    const v = (ua.match(/Windows NT ([\d.]+)/) || [])[1];
    return { os: "Windows", version: v === "10.0" ? "10/11" : v || "", key: "windows" };
  }
  if (/Mac OS X/i.test(ua)) return { os: "macOS", version: ((ua.match(/Mac OS X ([\d_]+)/) || [])[1] || "").replace(/_/g, "."), key: "mac" };
  if (/Linux/i.test(ua)) return { os: "Linux", version: "", key: "linux" };
  return { os: "Desconhecido", version: "", key: "other" };
}

export function installationId() {
  let id = localStorage.getItem("cc_installation_id");
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("cc_installation_id", id);
  }
  return id;
}

export const canShareScreen = () => !!navigator.mediaDevices?.getDisplayMedia;

let audioCtx = null;
export function beep(freq = 880, ms = 160) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.08;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + ms / 1000);
  } catch {
    /* audio not available */
  }
}
