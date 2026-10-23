using Microsoft.Extensions.Logging;

namespace AssetFlow.Agent;

public sealed class DailyFileLoggerProvider(string directory) : ILoggerProvider
{
    private readonly DailyLogWriter writer = new(directory);
    public ILogger CreateLogger(string category) => new DailyFileLogger(category, writer);
    public void Dispose() { }
}

internal sealed class DailyLogWriter(string directory)
{
    private readonly object gate = new();
    private DateOnly? cleanedDay;
    private const long MaxBytes = 10 * 1024 * 1024;

    public void Write(string prefix, string line)
    {
        try
        {
            lock (gate)
            {
                Directory.CreateDirectory(directory);
                var now = DateTime.Now;
                if (cleanedDay != DateOnly.FromDateTime(now))
                {
                    foreach (var pattern in new[] { "agent-*.log", "communication-*.log" })
                        foreach (var file in Directory.EnumerateFiles(directory, pattern))
                            if (File.GetLastWriteTime(file) < now.AddDays(-30)) File.Delete(file);
                    cleanedDay = DateOnly.FromDateTime(now);
                }
                var path = Path.Combine(directory, $"{prefix}-{now:yyyyMMdd}.log");
                if (File.Exists(path) && new FileInfo(path).Length >= MaxBytes)
                {
                    for (var i = 4; i >= 1; i--)
                    {
                        var from = i == 1 ? path : path.Replace(".log", $".{i - 1}.log");
                        var to = path.Replace(".log", $".{i}.log");
                        if (File.Exists(from)) File.Move(from, to, true);
                    }
                }
                File.AppendAllText(path, line);
            }
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // Disk-full/access failures in logging must not prevent device communication.
            System.Diagnostics.Trace.WriteLine($"AssetFlow log write failed: {e.GetType().Name}");
        }
    }
}

internal sealed class DailyFileLogger(string category, DailyLogWriter writer) : ILogger
{
    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
    public bool IsEnabled(LogLevel level) => level >= LogLevel.Information;
    public void Log<TState>(LogLevel level, EventId eventId, TState state, Exception? error,
        Func<TState, Exception?, string> formatter)
    {
        if (!IsEnabled(level)) return;
        var prefix = category == typeof(AgentCommunicationHandler).FullName ? "communication" : "agent";
        writer.Write(prefix, $"{DateTimeOffset.Now:O} [{level}] {category}: {formatter(state, error)}" +
            (error is null ? "" : Environment.NewLine + error) + Environment.NewLine);
    }
}
