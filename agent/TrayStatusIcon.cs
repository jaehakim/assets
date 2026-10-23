using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

namespace AssetFlow.Agent;

// Native UI drawing keeps semantic colors deterministic at every Windows DPI.
internal static class TrayStatusIcon
{
    public static Icon Create(AgentHealthColor state)
    {
        var size = Math.Max(32, SystemInformation.SmallIconSize.Width);
        using var bitmap = new Bitmap(size, size);
        using (var g = Graphics.FromImage(bitmap))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.ScaleTransform(size / 32f, size / 32f);
            var color = state switch
            {
                AgentHealthColor.Healthy => Color.FromArgb(21, 128, 61),
                AgentHealthColor.Error => Color.FromArgb(220, 38, 38),
                AgentHealthColor.Warning => Color.FromArgb(202, 138, 4),
                _ => Color.FromArgb(100, 116, 139)
            };
            using var fill = new SolidBrush(color);
            using var outline = new Pen(Color.White, 1);
            using var path = new GraphicsPath();
            path.AddArc(1, 1, 10, 10, 180, 90);
            path.AddArc(21, 1, 10, 10, 270, 90);
            path.AddArc(21, 21, 10, 10, 0, 90);
            path.AddArc(1, 21, 10, 10, 90, 90);
            path.CloseFigure();
            g.FillPath(fill, path);
            g.DrawPath(outline, path);
            using var stroke = new Pen(Color.White, 2.5f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
            g.DrawRectangle(stroke, 6, 7, 20, 14);
            g.DrawLine(stroke, 16, 21, 16, 25);
            g.DrawLine(stroke, 11, 25, 21, 25);
            if (state == AgentHealthColor.Healthy)
                g.DrawLines(stroke, [new PointF(11, 14), new PointF(14, 17), new PointF(21, 11)]);
            else if (state is AgentHealthColor.Error or AgentHealthColor.Warning)
            {
                g.DrawLine(stroke, 16, 10, 16, 14);
                g.FillEllipse(Brushes.White, 14.7f, 16, 2.6f, 2.6f);
            }
            else g.DrawLine(stroke, 12, 14, 20, 14);
        }
        var handle = bitmap.GetHicon();
        try
        {
            using var icon = Icon.FromHandle(handle);
            return (Icon)icon.Clone();
        }
        finally { DestroyIcon(handle); }
    }

    [DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr handle);
}
