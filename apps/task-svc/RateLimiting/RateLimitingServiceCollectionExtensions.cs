using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace ShopNest.TaskSvc.RateLimiting;

/// <summary>
/// Registers the two named rate-limit policies used by the API:
/// <list type="bullet">
///   <item><description><c>read</c>  — applied to GET endpoints</description></item>
///   <item><description><c>write</c> — applied to POST/PUT/DELETE endpoints</description></item>
/// </list>
/// Both policies partition by client IP so a noisy peer can't burn the
/// global budget. Rejection emits an RFC 7807 ProblemDetails body plus a
/// <c>Retry-After</c> header, matching the rest of the API's error shape.
/// </summary>
internal static class RateLimitingServiceCollectionExtensions
{
    public static IServiceCollection AddTaskRateLimiting(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        services.Configure<RateLimitOptions>(configuration.GetSection(RateLimitOptions.SectionName));

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = WriteProblemDetails;

            options.AddPolicy(
                "read",
                ctx =>
                {
                    var o = ctx
                        .RequestServices.GetRequiredService<IOptions<RateLimitOptions>>()
                        .Value.Read;
                    return Partition(ctx, o.PermitLimit, o.WindowSeconds);
                }
            );

            options.AddPolicy(
                "write",
                ctx =>
                {
                    var o = ctx
                        .RequestServices.GetRequiredService<IOptions<RateLimitOptions>>()
                        .Value.Write;
                    return Partition(ctx, o.PermitLimit, o.WindowSeconds);
                }
            );
        });

        return services;
    }

    private static RateLimitPartition<string> Partition(
        HttpContext ctx,
        int permits,
        int windowSeconds
    )
    {
        // Prefer the socket's RemoteIpAddress (already trusted by Kestrel
        // when behind ASP.NET Core's ForwardedHeaders middleware). Falls
        // back to X-Forwarded-For for setups where forwarded headers are
        // pre-resolved upstream and the socket address is the proxy.
        var ip =
            ctx.Connection.RemoteIpAddress?.ToString()
            ?? ctx.Request.Headers["X-Forwarded-For"].FirstOrDefault()
            ?? "unknown";

        return RateLimitPartition.GetFixedWindowLimiter(
            ip,
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = permits,
                Window = TimeSpan.FromSeconds(windowSeconds),
                QueueLimit = 0,
                AutoReplenishment = true,
            }
        );
    }

    private static async ValueTask WriteProblemDetails(
        OnRejectedContext context,
        CancellationToken ct
    )
    {
        var http = context.HttpContext;
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            http.Response.Headers.RetryAfter = ((int)retryAfter.TotalSeconds).ToString(
                CultureInfo.InvariantCulture
            );
        }
        http.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await http.Response.WriteAsJsonAsync(
            new ProblemDetails
            {
                Type = "https://httpstatuses.io/429",
                Title = "Too many requests",
                Status = StatusCodes.Status429TooManyRequests,
                Detail = "Rate limit exceeded. Slow down and retry after the value in "
                    + "the Retry-After header.",
                Extensions = { ["traceId"] = http.TraceIdentifier },
            },
            options: null,
            contentType: "application/problem+json",
            cancellationToken: ct
        );
    }
}
