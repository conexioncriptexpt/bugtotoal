using System.Text.Json.Nodes;

namespace CryptoConex;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        using var mutex = new Mutex(true, "CryptoConexSingleInstance", out var first);
        if (!first) return;
        ApplicationConfiguration.Initialize();
        var link = args.FirstOrDefault(a => a.StartsWith("--link="))?.Substring(7);
        Application.Run(new MainForm(link));
    }
}

/// <summary>Minimal client UI: logo, CONECTAR, status, TERMINAR. System tray + status notifications. No login.</summary>
public sealed class MainForm : Form
{
    readonly Label _status = new() { AutoSize = false, Height = 60, Dock = DockStyle.Top, TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.White, Font = new Font("Segoe UI", 14) };
    readonly Button _connect = new() { Text = "CONECTAR", Height = 90, Dock = DockStyle.Top, BackColor = Color.FromArgb(132, 204, 22), Font = new Font("Segoe UI", 26, FontStyle.Bold), FlatStyle = FlatStyle.Flat, AccessibleName = "Conectar ao técnico" };
    readonly Button _end = new() { Text = "TERMINAR ASSISTÊNCIA", Height = 70, Dock = DockStyle.Top, BackColor = Color.FromArgb(220, 38, 38), ForeColor = Color.White, Font = new Font("Segoe UI", 16, FontStyle.Bold), FlatStyle = FlatStyle.Flat, Visible = false };
    readonly NotifyIcon _tray = new() { Text = "Suporte Técnico Avançado", Visible = true };
    readonly string? _link;
    SignalingClient? _sig;
    WebRtcSession? _rtc;
    PrivacyOverlay? _privacy;
    readonly System.Windows.Forms.Timer _thumbTimer = new() { Interval = 3000 };
    string? _token, _sessionId, _techName;
    JsonArray _ice = new();
    bool _control;

    public MainForm(string? link)
    {
        _link = link;
        Text = "Suporte Técnico Avançado"; BackColor = Color.FromArgb(10, 11, 14); Size = new Size(480, 620); StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedSingle; MaximizeBox = false;
        var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "app.ico");
        if (File.Exists(iconPath)) { Icon = new Icon(iconPath); _tray.Icon = Icon; }
        var logo = new PictureBox { Dock = DockStyle.Top, Height = 240, SizeMode = PictureBoxSizeMode.Zoom, ImageLocation = Path.Combine(AppContext.BaseDirectory, "Assets", "logo.png") };
        var note = new Label { Text = "Só partilhe o ecrã com um técnico que você contactou. Nunca pedimos palavras-passe, códigos bancários ou dinheiro. A partilha só começa com a sua autorização.", Dock = DockStyle.Bottom, Height = 80, ForeColor = Color.FromArgb(148, 163, 184), TextAlign = ContentAlignment.MiddleCenter };
        Padding = new Padding(24);
        Controls.Add(_end); Controls.Add(new Panel { Height = 12, Dock = DockStyle.Top }); Controls.Add(_connect); Controls.Add(_status); Controls.Add(logo); Controls.Add(note);
        SetStatus("Carrega em CONECTAR para pedir ajuda");
        _connect.Click += async (_, _) => await Connect();
        _end.Click += async (_, _) => await End(true);
        _tray.ContextMenuStrip = new ContextMenuStrip();
        _tray.ContextMenuStrip.Items.Add("Abrir", null, (_, _) => { Show(); WindowState = FormWindowState.Normal; });
        _tray.ContextMenuStrip.Items.Add("Terminar assistência", null, async (_, _) => await End(true));
        _tray.ContextMenuStrip.Items.Add("Sair", null, async (_, _) => { await End(true); _tray.Visible = false; Application.Exit(); });
        _tray.DoubleClick += (_, _) => Show();
        FormClosing += (_, e) => { if (_sessionId != null && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); Notify("A assistência continua ativa. Use o ícone na bandeja para terminar."); } };
    }

    void Ui(Action a) { if (InvokeRequired) BeginInvoke(a); else a(); }
    void SetStatus(string s) => Ui(() => _status.Text = s);
    void Notify(string s) => Ui(() => _tray.ShowBalloonTip(4000, "Suporte Técnico Avançado", s, ToolTipIcon.Info));
    Task Emit(string ev, JsonObject d) { if (_sessionId != null) d["session_id"] = _sessionId; return _sig?.Emit(ev, d) ?? Task.CompletedTask; }

    async Task Connect()
    {
        _connect.Enabled = false;
        SetStatus("A ligar…");
        try
        {
            var res = await ApiClient.Connect(_link);
            _token = res.Token;
            _ice = await ApiClient.IceServers(res.Token);
            _rtc = new WebRtcSession(Emit);
            _sig = new SignalingClient(() => _token!, (ev, d) => Ui(() => OnEvent(ev, d)), online => { if (!online && _sessionId != null) SetStatus("Sem ligação. A tentar de novo…"); });
            _sig.Start();
            _thumbTimer.Tick -= SendThumbnail; _thumbTimer.Tick += SendThumbnail; _thumbTimer.Start();
            SetStatus("Pedido enviado. A aguardar um técnico…");
            _connect.Visible = false; _end.Visible = true;
        }
        catch { SetStatus("Sem ligação ao servidor. Verifique a internet."); _connect.Enabled = true; }
    }

    void OnEvent(string ev, JsonObject d)
    {
        switch (ev)
        {
            case "connected" when d["session"] is JsonObject s: _sessionId = s["id"]?.ToString(); _techName = s["technician_name"]?.ToString(); break;
            case "support:assigned" or "session:transferred" when d["session"] is JsonObject s:
                _sessionId = s["id"]?.ToString(); _techName = s["technician_name"]?.ToString();
                SetStatus($"Técnico atribuído: {_techName}"); Notify($"O técnico {_techName} vai atender-te."); break;
            case "session:started": AskConsent(); break;
            case "technician:joined":
                _sessionId = d["session_id"]?.ToString();
                _ = _rtc!.Start(_ice); break;
            case "webrtc:answer" when d["sdp"] is JsonObject sdp: _rtc?.OnAnswer(sdp); break;
            case "webrtc:ice-candidate" when d["candidate"] is JsonObject c: _rtc?.OnRemoteIce(c); break;
            case "remote:command" when _control && d["command"] is JsonObject cmd: InputController.Handle(cmd); break;
            case "privacy:enabled":
                _privacy ??= new PrivacyOverlay(() => _ = End(true)); _privacy.Show(); break;
            case "privacy:disabled": _privacy?.Close(); _privacy = null; break;
            case "support:rejected": _sessionId = null; SetStatus("Pedido enviado. A aguardar um técnico…"); break;
            case "session:ended" or "support:cancelled": _ = End(false); break;
        }
    }

    void AskConsent()
    {
        var r = MessageBox.Show(this, $"O técnico {_techName} vai ver o teu ecrã.\n\nQueres também deixar que ele use o rato e o teclado por ti?\n\nSim = ver e ajudar · Não = só ver", "Autorizar o técnico?", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
        _control = r == DialogResult.Yes;
        _ = Emit("consent:update", new JsonObject { ["screen"] = true, ["control"] = _control });
        SetStatus($"Assistência ativa com {_techName}");
        Notify("Assistência remota ativa.");
    }

    /// <summary>Small JPEG preview (320px) of the shared screen for the technician's device list.</summary>
    void SendThumbnail(object? sender, EventArgs e)
    {
        try
        {
            var b = Screen.PrimaryScreen!.Bounds;
            using var full = new Bitmap(b.Width, b.Height);
            using (var g = Graphics.FromImage(full)) g.CopyFromScreen(b.Location, Point.Empty, b.Size);
            var h = 320 * b.Height / b.Width;
            using var small = new Bitmap(full, new Size(320, h));
            using var ms = new MemoryStream();
            small.Save(ms, System.Drawing.Imaging.ImageFormat.Jpeg);
            _ = Emit("device:thumbnail", new JsonObject { ["image"] = "data:image/jpeg;base64," + Convert.ToBase64String(ms.ToArray()) });
        }
        catch { /* desktop locked or secure desktop: skip */ }
    }

    async Task End(bool notify)
    {
        if (notify && _sessionId != null) await Emit("session:end", new JsonObject());
        else if (notify && _token != null) await ApiClient.Cancel(_token);
        _thumbTimer.Stop();
        _rtc?.Dispose(); _rtc = null;
        _sig?.Stop(); _sig = null;
        _privacy?.Close(); _privacy = null;
        _sessionId = null; _control = false;
        Ui(() => { _connect.Visible = true; _connect.Enabled = true; _end.Visible = false; Show(); });
        SetStatus("Assistência terminada");
    }
}
