namespace ShopNest.TaskSvc.Caching;

/// <summary>
/// Resolves the distributed cache backend at startup:
/// <list type="bullet">
///   <item><description><c>REDIS_URL</c> set → Redis via StackExchange.Redis</description></item>
///   <item><description><c>REDIS_URL</c> unset → in-memory <c>MemoryDistributedCache</c></description></item>
/// </list>
/// In both cases <see cref="ITaskCache"/> is wired to <see cref="TaskCache"/>,
/// which owns the key-prefix so the two backends produce identical keys.
/// The chosen backend is logged at startup for diagnostics.
/// </summary>
internal static class CachingServiceCollectionExtensions
{
    public static IServiceCollection AddTaskCache(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        services.Configure<TaskCacheOptions>(configuration.GetSection(TaskCacheOptions.SectionName));

        var redisUrl =
            configuration["REDIS_URL"] ?? Environment.GetEnvironmentVariable("REDIS_URL");

        if (!string.IsNullOrWhiteSpace(redisUrl))
        {
            var redisConfig = NormalizeRedisUri(redisUrl);
            services.AddStackExchangeRedisCache(opts =>
            {
                opts.Configuration = redisConfig;
                // Deliberately not setting opts.InstanceName — TaskCache.KeyFor
                // applies the prefix uniformly across both backends. Setting
                // InstanceName here would make Redis double-prefix every key.
            });
            Console.WriteLine($"[task-svc] cache backend → Redis ({MaskRedisHost(redisConfig)})");
        }
        else
        {
            services.AddDistributedMemoryCache();
            Console.WriteLine(
                "[task-svc] cache backend → in-memory (REDIS_URL unset; multi-replica deployments "
                    + "should set it to share cache state)"
            );
        }

        services.AddSingleton<ITaskCache, TaskCache>();
        return services;
    }

    /// <summary>
    /// Accept both URI form (<c>rediss://default:password@host:6379/0</c>,
    /// typically what Upstash hands out) and StackExchange.Redis-native form
    /// (<c>host:port,password=...,ssl=True</c>). The StackExchange parser
    /// handles the latter directly; for URIs we hand-roll the conversion
    /// since it doesn't understand them.
    /// </summary>
    private static string NormalizeRedisUri(string raw)
    {
        var trimmed = raw.Trim().Trim('"', '\'');
        var isUri =
            trimmed.StartsWith("redis://", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("rediss://", StringComparison.OrdinalIgnoreCase);
        if (!isUri)
        {
            return trimmed;
        }

        var uri = new Uri(trimmed);
        var ssl = trimmed.StartsWith("rediss://", StringComparison.OrdinalIgnoreCase);
        var host = uri.Host;
        var port = uri.IsDefaultPort ? 6379 : uri.Port;

        string? password = null;
        if (!string.IsNullOrEmpty(uri.UserInfo))
        {
            var parts = uri.UserInfo.Split(':', 2);
            password =
                parts.Length > 1
                    ? Uri.UnescapeDataString(parts[1])
                    : Uri.UnescapeDataString(parts[0]);
        }

        var pieces = new List<string> { $"{host}:{port}" };
        if (!string.IsNullOrEmpty(password))
        {
            pieces.Add($"password={password}");
        }
        if (ssl)
        {
            pieces.Add("ssl=True");
        }
        pieces.Add("abortConnect=false");

        return string.Join(",", pieces);
    }

    /// <summary>
    /// Strip secrets before logging the connection string. Keeps host:port
    /// for diagnostics without leaking the password into stdout.
    /// </summary>
    private static string MaskRedisHost(string config) => config.Split(',')[0];
}
