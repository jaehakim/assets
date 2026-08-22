using AssetFlow.Agent;
if(args.Any(x=>x.Equals("--tray",StringComparison.OrdinalIgnoreCase))){ApplicationConfiguration.Initialize();TrayApplication.Run();return;}
TrayApplication.EnsureStartupRegistration();
var builder=Host.CreateApplicationBuilder(args);
builder.Logging.AddProvider(new DailyFileLoggerProvider(Path.Combine(AppContext.BaseDirectory,"logs")));
builder.Services.AddWindowsService(o=>o.ServiceName="AssetFlowAgent");
builder.Services.AddHttpClient<AgentClient>();
builder.Services.AddSingleton<AgentState>();
builder.Services.AddSingleton<InventoryCollector>();
builder.Services.AddSingleton<UpdateService>();
builder.Services.AddHostedService<Worker>();
await builder.Build().RunAsync();
