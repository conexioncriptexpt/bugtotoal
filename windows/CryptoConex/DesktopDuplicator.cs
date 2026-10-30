using Vortice.Direct3D;
using Vortice.Direct3D11;
using Vortice.DXGI;
using static Vortice.Direct3D11.D3D11;

namespace CryptoConex;

/// <summary>Desktop Duplication API capture of the primary output (BGRA frames). Cannot capture the UAC secure desktop by design.</summary>
public sealed class DesktopDuplicator : IDisposable
{
    readonly ID3D11Device _device;
    readonly ID3D11DeviceContext _ctx;
    readonly IDXGIOutputDuplication _dup;
    readonly ID3D11Texture2D _staging;
    public int Width { get; }
    public int Height { get; }
    byte[] _last = Array.Empty<byte>();

    public DesktopDuplicator()
    {
        D3D11CreateDevice(null, DriverType.Hardware, DeviceCreationFlags.BgraSupport, null!, out _device!, out _ctx!).CheckError();
        using var dxgi = _device.QueryInterface<IDXGIDevice>();
        using var adapter = dxgi.GetAdapter();
        adapter.EnumOutputs(0, out var output).CheckError();
        using var output1 = output.QueryInterface<IDXGIOutput1>();
        var bounds = output.Description.DesktopCoordinates;
        Width = bounds.Right - bounds.Left;
        Height = bounds.Bottom - bounds.Top;
        _dup = output1.DuplicateOutput(_device);
        output.Dispose();
        _staging = _device.CreateTexture2D(new Texture2DDescription
        {
            Width = (uint)Width, Height = (uint)Height, MipLevels = 1, ArraySize = 1, Format = Format.B8G8R8A8_UNorm,
            SampleDescription = new SampleDescription(1, 0), Usage = ResourceUsage.Staging, CPUAccessFlags = CpuAccessFlags.Read,
        });
    }

    /// <summary>Returns the latest BGRA frame (re-uses the previous one if the screen did not change).</summary>
    public unsafe byte[] Capture()
    {
        var hr = _dup.AcquireNextFrame(100, out _, out var resource);
        if (hr.Failure) return _last;
        try
        {
            using var tex = resource.QueryInterface<ID3D11Texture2D>();
            _ctx.CopyResource(_staging, tex);
            var map = _ctx.Map(_staging, 0, MapMode.Read);
            var size = Width * Height * 4;
            if (_last.Length != size) _last = new byte[size];
            fixed (byte* dst = _last)
            {
                for (var y = 0; y < Height; y++)
                    Buffer.MemoryCopy((byte*)map.DataPointer + y * map.RowPitch, dst + y * Width * 4, Width * 4, Width * 4);
            }
            _ctx.Unmap(_staging, 0);
        }
        finally
        {
            resource.Dispose();
            _dup.ReleaseFrame();
        }
        return _last;
    }

    public void Dispose()
    {
        _staging.Dispose(); _dup.Dispose(); _ctx.Dispose(); _device.Dispose();
    }
}
