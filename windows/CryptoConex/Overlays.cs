using System.Runtime.InteropServices;

namespace CryptoConex;

/// <summary>Always-visible "assistência remota ativa" banner (top of screen, topmost, click-through to nothing hidden).</summary>
public sealed class AssistIndicator : Form
{
    public AssistIndicator(Action onEnd)
    {
        FormBorderStyle = FormBorderStyle.None; TopMost = true; ShowInTaskbar = false; BackColor = Color.FromArgb(132, 204, 22);
        var area = Screen.PrimaryScreen!.WorkingArea;
        Size = new Size(460, 44); Location = new Point(area.Left + (area.Width - 460) / 2, area.Top);
        var label = new Label { Text = "● Assistência remota ativa — Crypto Conex", ForeColor = Color.Black, Font = new Font("Segoe UI", 11, FontStyle.Bold), AutoSize = false, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(12, 0, 0, 0) };
        var btn = new Button { Text = "TERMINAR", Dock = DockStyle.Right, Width = 110, BackColor = Color.FromArgb(220, 38, 38), ForeColor = Color.White, FlatStyle = FlatStyle.Flat, Font = new Font("Segoe UI", 10, FontStyle.Bold) };
        btn.Click += (_, _) => onEnd();
        Controls.Add(label); Controls.Add(btn);
    }
}

/// <summary>
/// Privacy mode: full-screen dark window shown to the client. Uses SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)
/// (Windows 10 2004+), an official API, so the capture still shows the real desktop to the technician.
/// The client can always switch it off or end the session.
/// </summary>
public sealed class PrivacyOverlay : Form
{
    [DllImport("user32.dll")] static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint affinity);
    const uint WDA_EXCLUDEFROMCAPTURE = 0x11;
    readonly Label _requested;

    public PrivacyOverlay(Action onDisable, Action onEnd)
    {
        FormBorderStyle = FormBorderStyle.None; WindowState = FormWindowState.Maximized; TopMost = true; BackColor = Color.Black; ShowInTaskbar = false;
        var panel = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, Anchor = AnchorStyles.None, WrapContents = false };
        panel.Controls.Add(new Label { Text = "Ajuste Técnico — Aguarde...", ForeColor = Color.White, Font = new Font("Segoe UI", 32, FontStyle.Bold), AutoSize = true });
        _requested = new Label { Text = "O técnico pede para desligares este modo.", ForeColor = Color.Gold, Font = new Font("Segoe UI", 14), AutoSize = true, Visible = false };
        panel.Controls.Add(_requested);
        var off = new Button { Text = "DESLIGAR MODO", Width = 320, Height = 64, BackColor = Color.FromArgb(132, 204, 22), Font = new Font("Segoe UI", 16, FontStyle.Bold), FlatStyle = FlatStyle.Flat };
        off.Click += (_, _) => onDisable();
        var end = new Button { Text = "TERMINAR", Width = 320, Height = 64, BackColor = Color.FromArgb(220, 38, 38), ForeColor = Color.White, Font = new Font("Segoe UI", 16, FontStyle.Bold), FlatStyle = FlatStyle.Flat };
        end.Click += (_, _) => onEnd();
        panel.Controls.Add(off); panel.Controls.Add(end);
        var table = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 1 };
        table.Controls.Add(panel);
        Controls.Add(table);
        Load += (_, _) => SetWindowDisplayAffinity(Handle, WDA_EXCLUDEFROMCAPTURE);
    }

    public void ShowRequested() => _requested.Visible = true;
}
