using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Win32;

namespace CryptoConex;

/// <summary>REST calls to the backend. TURN credentials are fetched per session and never stored on disk.</summary>
public static class ApiClient
{
    public static string BackendUrl { get; } = LoadBackendUrl();
    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(20) };

    static string LoadBackendUrl()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
        var url = File.Exists(path) ? JsonNode.Parse(File.ReadAllText(path))?["BackendUrl"]?.ToString() : null;
        return (url ?? "https://dominio.pt").TrimEnd('/');
    }

    /// <summary>Installation id created by the app on first run (HKCU), no hardware fingerprinting.</summary>
    public static string InstallationId()
    {
        using var key = Registry.CurrentUser.CreateSubKey(@"Software\CryptoConex");
        if (key.GetValue("InstallationId") is string id) return id;
        id = Guid.NewGuid().ToString();
        key.SetValue("InstallationId", id);
        return id;
    }

    public record ConnectResult(string DeviceId, string Token, string? TechnicianName, JsonObject? Session);

    public static async Task<ConnectResult> Connect(string? linkToken)
    {
        var screen = Screen.PrimaryScreen!.Bounds;
        var body = new
        {
            installation_id = InstallationId(),
            platform = "windows",
            os = "Windows",
            os_version = Environment.OSVersion.Version.ToString(),
            client_name = Environment.MachineName,
            screen = $"{screen.Width}x{screen.Height}",
            link_token = linkToken
        };
        var res = await Http.PostAsJsonAsync($"{BackendUrl}/api/public/connect", body);
        res.EnsureSuccessStatusCode();
        var j = JsonNode.Parse(await res.Content.ReadAsStringAsync())!.AsObject();
        return new ConnectResult(j["device_id"]!.ToString(), j["device_token"]!.ToString(),
            j["technician_name"]?.ToString(), j["session"] as JsonObject);
    }

    static HttpRequestMessage DeviceRequest(HttpMethod m, string path, string token)
    {
        var req = new HttpRequestMessage(m, $"{BackendUrl}{path}");
        req.Headers.Add("Authorization", $"Bearer {token}");
        req.Headers.Add("x-client-kind", "device");
        return req;
    }

    public static async Task<JsonArray> IceServers(string token)
    {
        var res = await Http.SendAsync(DeviceRequest(HttpMethod.Get, "/api/ice-servers", token));
        return JsonNode.Parse(await res.Content.ReadAsStringAsync())!["iceServers"]!.AsArray();
    }

    public static async Task Cancel(string token)
    {
        var req = DeviceRequest(HttpMethod.Post, "/api/public/cancel", token);
        req.Content = JsonContent.Create(new { });
        try { await Http.SendAsync(req); } catch { /* best effort */ }
    }
}
