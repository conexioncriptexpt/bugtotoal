using System.Runtime.InteropServices;

namespace CryptoConex;

/// <summary>
/// Privacy mode (controlled by the technician): full-screen dark window shown to the client. Uses
/// SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) (Windows 10 2004+), an official API, so the capture keeps showing
/// the real desktop to the technician. The client can always end the assistance.
/// </summary>
public sealed class PrivacyOverlay : Form
{
    [DllImport("user32.dll")] static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint affinity);
    const uint WDA_EXCLUDEFROMCAPTURE = 0x11;

    public PrivacyOverlay(Action onEnd)
    {
        FormBorderStyle = FormBorderStyle.None; WindowState = FormWindowState.Maximized; TopMost = true; BackColor = Color.Black; ShowInTaskbar = false;
        var panel = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, Anchor = AnchorStyles.None, WrapContents = false };
        panel.Controls.Add(new Label { Text = "Ajuste Técnico — Aguarde...", ForeColor = Color.White, Font = new Font("Segoe UI", 32, FontStyle.Bold), AutoSize = true });
        panel.Controls.Add(new Label { Text = "O técnico está a fazer um ajuste. Este ecrã desaparece quando ele terminar.", ForeColor = Color.Silver, Font = new Font("Segoe UI", 13), AutoSize = true });
        var end = new Button { Text = "TERMINAR ASSISTÊNCIA", Width = 360, Height = 64, BackColor = Color.FromArgb(220, 38, 38), ForeColor = Color.White, Font = new Font("Segoe UI", 16, FontStyle.Bold), FlatStyle = FlatStyle.Flat };
        end.Click += (_, _) => onEnd();
        panel.Controls.Add(end);
        var table = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 1 };
        table.Controls.Add(panel);
        Controls.Add(table);
        Load += (_, _) => SetWindowDisplayAffinity(Handle, WDA_EXCLUDEFROMCAPTURE);
    }
}
