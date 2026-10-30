using System.Net.WebSockets;
using System.Text;
using System.Text.Json.Nodes;

namespace CryptoConex;

/// <summary>Signalling over secure WebSocket ({event,data} JSON). Reconnects with exponential backoff.</summary>
public sealed class SignalingClient
{
    readonly Func<string> _token;
    readonly Action<string, JsonObject> _onEvent;
    readonly Action<bool> _onState;
    ClientWebSocket? _ws;
    CancellationTokenSource _cts = new();
    int _attempt;
    readonly SemaphoreSlim _sendLock = new(1, 1);

    public SignalingClient(Func<string> token, Action<string, JsonObject> onEvent, Action<bool> onState)
    { _token = token; _onEvent = onEvent; _onState = onState; }

    public void Start() => _ = Task.Run(Loop);

    async Task Loop()
    {
        while (!_cts.IsCancellationRequested)
        {
            try
            {
                _ws = new ClientWebSocket();
                _ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(25);
                var url = ApiClient.BackendUrl.Replace("https://", "wss://").Replace("http://", "ws://");
                await _ws.ConnectAsync(new Uri($"{url}/api/ws?kind=device&token={Uri.EscapeDataString(_token())}"), _cts.Token);
                _attempt = 0;
                _onState(true);
                await Receive(_ws);
            }
            catch when (!_cts.IsCancellationRequested) { }
            catch { return; }
            _onState(false);
            var delay = Math.Min(30000, 1000 * (1 << Math.Min(_attempt, 5))) + Random.Shared.Next(500);
            _attempt++;
            try { await Task.Delay(delay, _cts.Token); } catch { return; }
        }
    }

    async Task Receive(ClientWebSocket ws)
    {
        var buf = new byte[64 * 1024];
        var sb = new StringBuilder();
        while (ws.State == WebSocketState.Open)
        {
            var r = await ws.ReceiveAsync(buf, _cts.Token);
            if (r.MessageType == WebSocketMessageType.Close) return;
            sb.Append(Encoding.UTF8.GetString(buf, 0, r.Count));
            if (!r.EndOfMessage) continue;
            var msg = JsonNode.Parse(sb.ToString())?.AsObject();
            sb.Clear();
            if (msg == null) continue;
            _onEvent(msg["event"]?.ToString() ?? "", msg["data"] as JsonObject ?? new JsonObject());
        }
    }

    public async Task Emit(string ev, JsonObject data)
    {
        if (_ws?.State != WebSocketState.Open) return;
        var bytes = Encoding.UTF8.GetBytes(new JsonObject { ["event"] = ev, ["data"] = data }.ToJsonString());
        await _sendLock.WaitAsync();
        try { await _ws.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None); }
        finally { _sendLock.Release(); }
    }

    public void Stop()
    {
        _cts.Cancel();
        try { _ws?.Abort(); } catch { }
    }
}
