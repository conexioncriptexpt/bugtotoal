using System.Runtime.InteropServices;
using System.Text.Json.Nodes;

namespace CryptoConex;

/// <summary>
/// Authorised mouse/keyboard assistance via user32.dll SendInput. Executes only while a session with control consent
/// is active (checked by server and by the caller). Cannot interact with the UAC secure desktop or Ctrl+Alt+Del.
/// </summary>
public static class InputController
{
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Explicit)] struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION u; }

    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);

    const uint INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
    const uint LEFTDOWN = 0x02, LEFTUP = 0x04, RIGHTDOWN = 0x08, RIGHTUP = 0x10, WHEEL = 0x0800;
    const uint KEYUP = 0x02, UNICODE = 0x04;

    static readonly Dictionary<string, ushort> Vk = new()
    {
        ["ctrl"] = 0x11, ["alt"] = 0x12, ["shift"] = 0x10, ["win"] = 0x5B, ["enter"] = 0x0D, ["esc"] = 0x1B, ["tab"] = 0x09,
        ["backspace"] = 0x08, ["delete"] = 0x2E, ["up"] = 0x26, ["down"] = 0x28, ["left"] = 0x25, ["right"] = 0x27,
        ["a"] = 0x41, ["c"] = 0x43, ["d"] = 0x44, ["f"] = 0x46, ["v"] = 0x56, ["x"] = 0x58, ["z"] = 0x5A,
    };
    static readonly HashSet<string> AllowedShortcuts = new() { "ctrl+c", "ctrl+v", "ctrl+x", "ctrl+z", "ctrl+a", "ctrl+f", "alt+tab", "win+d", "enter", "esc", "tab", "backspace", "delete", "up", "down", "left", "right" };

    static void Send(params INPUT[] inputs) => SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<INPUT>());
    static INPUT Mouse(uint flags, uint data = 0) => new() { type = INPUT_MOUSE, u = new INPUTUNION { mi = new MOUSEINPUT { dwFlags = flags, mouseData = data } } };
    static INPUT Key(ushort vk, bool up) => new() { type = INPUT_KEYBOARD, u = new INPUTUNION { ki = new KEYBDINPUT { wVk = vk, dwFlags = up ? KEYUP : 0 } } };

    static void MoveTo(JsonObject cmd)
    {
        var w = GetSystemMetrics(0); var h = GetSystemMetrics(1);
        var x = Math.Clamp(cmd["x"]?.GetValue<double>() ?? 0.5, 0, 1); var y = Math.Clamp(cmd["y"]?.GetValue<double>() ?? 0.5, 0, 1);
        SetCursorPos((int)(x * w), (int)(y * h));
        Thread.Sleep(15);
    }

    public static void Handle(JsonObject cmd)
    {
        switch (cmd["type"]?.ToString())
        {
            case "pointer_move": MoveTo(cmd); break;
            case "click": MoveTo(cmd); Send(Mouse(LEFTDOWN), Mouse(LEFTUP)); break;
            case "double_click": MoveTo(cmd); Send(Mouse(LEFTDOWN), Mouse(LEFTUP), Mouse(LEFTDOWN), Mouse(LEFTUP)); break;
            case "right_click": MoveTo(cmd); Send(Mouse(RIGHTDOWN), Mouse(RIGHTUP)); break;
            case "scroll": Send(Mouse(WHEEL, unchecked((uint)(-(cmd["dy"]?.GetValue<int>() ?? 3) * 120)))); break;
            case "text": TypeText(cmd["text"]?.ToString() ?? ""); break;
            case "shortcut": Shortcut(cmd["keys"]?.ToString()?.ToLowerInvariant() ?? ""); break;
        }
    }

    static void TypeText(string text)
    {
        foreach (var ch in text.Take(500))
        {
            var down = new INPUT { type = INPUT_KEYBOARD, u = new INPUTUNION { ki = new KEYBDINPUT { wScan = ch, dwFlags = UNICODE } } };
            var up = down; up.u.ki.dwFlags = UNICODE | KEYUP;
            Send(down, up);
        }
    }

    static void Shortcut(string keys)
    {
        if (!AllowedShortcuts.Contains(keys)) return;
        var vks = keys.Split('+').Select(k => Vk[k]).ToArray();
        Send(vks.Select(v => Key(v, false)).Concat(vks.Reverse().Select(v => Key(v, true))).ToArray());
    }
}
