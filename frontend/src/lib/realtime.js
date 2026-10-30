import { WS_URL } from "./api";

// WebSocket client with rooms-style events and exponential backoff reconnection.
export class RealtimeClient {
  constructor(getQuery) {
    this.getQuery = getQuery;
    this.handlers = new Map();
    this.attempt = 0;
    this.closed = false;
    this.ws = null;
    this.ping = null;
  }

  async connect() {
    this.closed = false;
    let q;
    try {
      q = await this.getQuery();
    } catch {
      return this.scheduleReconnect();
    }
    if (this.closed) return;
    const ws = new WebSocket(`${WS_URL}/api/ws?${q}`);
    this.ws = ws;
    this.dispatch("_state", { state: "connecting" });
    ws.onopen = () => {
      this.attempt = 0;
      this.dispatch("_state", { state: "open" });
      this.ping = setInterval(() => this.emit("ping", {}), 25000);
    };
    ws.onmessage = (m) => {
      try {
        const { event, data } = JSON.parse(m.data);
        this.dispatch(event, data);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      clearInterval(this.ping);
      this.dispatch("_state", { state: "closed" });
      if (!this.closed) this.scheduleReconnect();
    };
  }

  scheduleReconnect() {
    const delay = Math.min(30000, 1000 * 2 ** this.attempt) + Math.random() * 500;
    this.attempt += 1;
    this.dispatch("_state", { state: "reconnecting", delay });
    setTimeout(() => {
      if (!this.closed) this.connect();
    }, delay);
  }

  on(event, cb) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(cb);
    return () => this.handlers.get(event)?.delete(cb);
  }

  dispatch(event, data) {
    this.handlers.get(event)?.forEach((cb) => cb(data));
    this.handlers.get("*")?.forEach((cb) => cb({ event, data }));
  }

  emit(event, data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }));
      return true;
    }
    return false;
  }

  close() {
    this.closed = true;
    clearInterval(this.ping);
    this.ws?.close();
  }
}
