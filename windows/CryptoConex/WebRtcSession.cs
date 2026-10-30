using System.Text.Json.Nodes;
using SIPSorcery.Net;
using SIPSorceryMedia.Abstractions;
using SIPSorceryMedia.Encoders;

namespace CryptoConex;

/// <summary>WebRTC sender: Desktop Duplication frames -> VP8 encoder -> RTP. Adapts frame rate to measured RTT/loss.</summary>
public sealed class WebRtcSession : IDisposable
{
    readonly Func<string, JsonObject, Task> _emit;
    RTCPeerConnection? _pc;
    DesktopDuplicator? _dup;
    readonly VpxVideoEncoder _encoder = new();
    CancellationTokenSource? _cts;
    int _fps = 12;

    public WebRtcSession(Func<string, JsonObject, Task> emit) => _emit = emit;

    public async Task Start(JsonArray iceServers)
    {
        Stop();
        var cfg = new RTCConfiguration { iceServers = new List<RTCIceServer>() };
        foreach (var s in iceServers)
        {
            var urls = s!["urls"] is JsonArray a ? a.Select(u => u!.ToString()) : new[] { s["urls"]!.ToString() };
            foreach (var url in urls)
                cfg.iceServers.Add(new RTCIceServer { urls = url, username = s["username"]?.ToString(), credential = s["credential"]?.ToString() });
        }
        _pc = new RTCPeerConnection(cfg);
        var track = new MediaStreamTrack(new VideoFormat(VideoCodecsEnum.VP8, 96), MediaStreamStatusEnum.SendOnly);
        _pc.addTrack(track);
        _pc.onicecandidate += c => _ = _emit("webrtc:ice-candidate", new JsonObject
        {
            ["candidate"] = new JsonObject { ["candidate"] = "candidate:" + c.candidate, ["sdpMid"] = c.sdpMid, ["sdpMLineIndex"] = (int)c.sdpMLineIndex }
        });
        _pc.onconnectionstatechange += st =>
        {
            _ = _emit("session:status", new JsonObject { ["connection_state"] = st.ToString() });
            if (st == RTCPeerConnectionState.connected) StartCapture();
            if (st == RTCPeerConnectionState.failed) _pc?.restartIce();
        };
        _pc.OnReceiveReport += (_, _, report) =>
        {
            var rr = report.ReceiverReport?.ReceptionReports?.FirstOrDefault();
            if (rr == null) return;
            _fps = rr.FractionLost > 25 ? Math.Max(4, _fps - 2) : Math.Min(20, _fps + 1);
        };
        var offer = _pc.createOffer();
        await _pc.setLocalDescription(offer);
        _dup ??= new DesktopDuplicator();
        await _emit("webrtc:offer", new JsonObject { ["sdp"] = new JsonObject { ["type"] = "offer", ["sdp"] = offer.sdp } });
        await _emit("session:status", new JsonObject { ["resolution"] = $"{_dup.Width}x{_dup.Height}" });
    }

    public void OnAnswer(JsonObject sdp) =>
        _pc?.setRemoteDescription(new RTCSessionDescriptionInit { type = RTCSdpType.answer, sdp = sdp["sdp"]!.ToString() });

    public void OnRemoteIce(JsonObject c)
    {
        var cand = c["candidate"]?.ToString();
        if (string.IsNullOrEmpty(cand)) return;
        _pc?.addIceCandidate(new RTCIceCandidateInit { candidate = cand, sdpMid = c["sdpMid"]?.ToString(), sdpMLineIndex = (ushort)(c["sdpMLineIndex"]?.GetValue<int>() ?? 0) });
    }

    void StartCapture()
    {
        if (_cts != null || _dup == null) return;
        _cts = new CancellationTokenSource();
        var token = _cts.Token;
        _ = Task.Run(async () =>
        {
            var w = _dup.Width; var h = _dup.Height;
            while (!token.IsCancellationRequested && _pc != null)
            {
                var start = Environment.TickCount64;
                var frame = _dup.Capture();
                if (frame.Length > 0)
                {
                    var encoded = _encoder.EncodeVideo(w, h, frame, VideoPixelFormatsEnum.Bgra, VideoCodecsEnum.VP8);
                    if (encoded != null) _pc.SendVideo((uint)(90000 / _fps), encoded);
                }
                var wait = 1000 / _fps - (int)(Environment.TickCount64 - start);
                if (wait > 0) await Task.Delay(wait, token).ContinueWith(_ => { });
            }
        }, token);
    }

    public void Stop()
    {
        _cts?.Cancel(); _cts = null;
        _pc?.Close("fim"); _pc = null;
    }

    public void Dispose() { Stop(); _dup?.Dispose(); _encoder.Dispose(); }
}
