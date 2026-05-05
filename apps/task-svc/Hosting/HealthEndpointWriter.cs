using System.Text.Json;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace ShopNest.TaskSvc.Hosting;

/// <summary>
/// Custom JSON writer for <c>/health/ready</c>. The default
/// <c>UIResponseWriter</c> from AspNetCore.HealthChecks pulls in a heavier
/// payload — this version returns just enough for orchestrators and humans:
/// per-check status, duration, and the first error message.
/// </summary>
internal static class HealthEndpointWriter
{
    public static Task WriteJsonAsync(HttpContext ctx, HealthReport report)
    {
        ctx.Response.ContentType = "application/json; charset=utf-8";
        var payload = JsonSerializer.SerializeToUtf8Bytes(
            new
            {
                status = report.Status.ToString(),
                totalDuration = report.TotalDuration.TotalMilliseconds,
                checks = report.Entries.Select(e => new
                {
                    name = e.Key,
                    status = e.Value.Status.ToString(),
                    durationMs = e.Value.Duration.TotalMilliseconds,
                    error = e.Value.Exception?.Message,
                }),
            }
        );
        return ctx.Response.Body.WriteAsync(payload, 0, payload.Length);
    }
}
