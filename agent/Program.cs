using AssetFlow.Agent;
var builder=Host.CreateApplicationBuilder(args);builder.Services.AddWindowsService(o=>o.ServiceName="AssetFlowAgent");builder.Services.AddHttpClient<AgentClient>();builder.Services.AddSingleton<AgentState>();builder.Services.AddSingleton<InventoryCollector>();builder.Services.AddHostedService<Worker>();await builder.Build().RunAsync();
