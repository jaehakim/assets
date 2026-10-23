using AssetFlow.Agent;

internal static class Program
{
    // WinForms requires STA, including when launched by the service.
    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Any(x => x.Equals("--tray", StringComparison.OrdinalIgnoreCase)))
        {
            try
            {
                ApplicationConfiguration.Initialize();
                Application.ThreadException += (_, e) => TrayApplication.LogError(e.Exception);
                TrayApplication.Run();
            }
            catch (Exception error) { TrayApplication.LogError(error); }
            return;
        }

        TrayApplication.EnsureStartupRegistration();
        var builder = Host.CreateApplicationBuilder(args);
        builder.Logging.AddProvider(new DailyFileLoggerProvider(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "AssetFlow", "logs")));
        builder.Services.AddWindowsService(o => o.ServiceName = "AssetFlowAgent");
        builder.Services.AddTransient<AgentCommunicationHandler>();
        builder.Services.AddHttpClient<AgentClient>().AddHttpMessageHandler<AgentCommunicationHandler>();
        builder.Services.AddSingleton<AgentState>();
        builder.Services.AddSingleton<AgentHealth>();
        builder.Services.AddHostedService<AgentHealthService>();
        builder.Services.AddSingleton<InventoryCollector>();
        builder.Services.AddSingleton<UpdateService>();
        // Begin session monitoring before inventory collection can block on WMI.
        builder.Services.AddHostedService<TraySessionService>();
        builder.Services.AddHostedService<Worker>();
        builder.Build().Run();
    }
}
