using System.Diagnostics;
using Microsoft.Extensions.Logging;

namespace AssetFlow.Agent;

public sealed class AgentCommunicationHandler(ILogger<AgentCommunicationHandler> log) : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var id = Guid.NewGuid().ToString("N");
        var timer = Stopwatch.StartNew();
        // Never log the host, query string, headers or request/response body.
        var path = request.RequestUri?.AbsolutePath ?? "unknown";
        var endpoint = path switch
        {
            "/api/v1/agents/register" => "register",
            "/api/v1/agents/heartbeat" => "heartbeat",
            "/api/v1/agents/inventory" => "inventory",
            "/api/v1/agents/updates/latest" => "updates/latest",
            _ when path.StartsWith("/api/v1/agents/updates/", StringComparison.Ordinal) && path.EndsWith("/download", StringComparison.Ordinal) => "updates/download",
            _ => "other"
        };
        log.LogInformation("HTTP_START request={RequestId} method={Method} endpoint={Endpoint} requestBytes={Bytes}",
            id, request.Method.Method, endpoint, request.Content?.Headers.ContentLength);
        try
        {
            var response = await base.SendAsync(request, ct);
            log.Log(response.IsSuccessStatusCode ? LogLevel.Information : LogLevel.Warning,
                "HTTP_RESPONSE request={RequestId} endpoint={Endpoint} status={Status} outcome={Outcome} durationMs={Duration} responseBytes={Bytes} stage=response_headers",
                id, endpoint, (int)response.StatusCode, response.IsSuccessStatusCode ? "SUCCESS" : "FAILED",
                timer.ElapsedMilliseconds, response.Content.Headers.ContentLength);
            return response;
        }
        catch (Exception error)
        {
            log.LogWarning("HTTP_FAILED request={RequestId} endpoint={Endpoint} reason={Reason} durationMs={Duration}",
                id, endpoint, error is OperationCanceledException ? "CANCELLED_OR_TIMEOUT" : error.GetType().Name,
                timer.ElapsedMilliseconds);
            throw;
        }
    }
}
