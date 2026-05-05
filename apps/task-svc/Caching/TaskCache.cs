using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Options;
using ShopNest.TaskSvc.Dtos;

namespace ShopNest.TaskSvc.Caching;

/// <summary>
/// <see cref="ITaskCache"/> implementation backed by <see cref="IDistributedCache"/>.
/// Resolves to Redis when <c>REDIS_URL</c> is set, or to an in-memory cache
/// otherwise (DI is wired in <c>Program.cs</c>). Cache failures are logged
/// and swallowed — a degraded cache should never take down a request.
/// </summary>
public sealed class TaskCache : ITaskCache
{
    private readonly IDistributedCache _cache;
    private readonly TaskCacheOptions _opts;
    private readonly ILogger<TaskCache> _log;

    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public TaskCache(
        IDistributedCache cache,
        IOptions<TaskCacheOptions> options,
        ILogger<TaskCache> log
    )
    {
        _cache = cache;
        _opts = options.Value;
        _log = log;
        // One-time visibility log — useful when diagnosing why cache writes
        // appear to vanish (e.g. an unintended MemoryDistributedCache winning
        // DI registration). Logged at Information so it shows up in default
        // dev logging without needing a special filter.
        _log.LogInformation(
            "TaskCache wired to IDistributedCache implementation: {Impl}",
            cache.GetType().FullName
        );
    }

    public async Task<TaskResponse?> GetAsync(Guid id, CancellationToken ct)
    {
        var key = KeyFor(id);
        try
        {
            var bytes = await _cache.GetAsync(key, ct);
            if (bytes is null || bytes.Length == 0)
            {
                return null;
            }
            return JsonSerializer.Deserialize<TaskResponse>(bytes, JsonOpts);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _log.LogWarning(ex, "Cache read failed for {Key}; falling back to DB", key);
            return null;
        }
    }

    public async Task SetAsync(TaskResponse value, CancellationToken ct)
    {
        var key = KeyFor(value.Id);
        try
        {
            var bytes = JsonSerializer.SerializeToUtf8Bytes(value, JsonOpts);
            await _cache.SetAsync(
                key,
                bytes,
                new DistributedCacheEntryOptions
                {
                    SlidingExpiration = TimeSpan.FromSeconds(_opts.TtlSeconds),
                },
                ct
            );
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _log.LogWarning(ex, "Cache write failed for {Key}; continuing without cache", key);
        }
    }

    public async Task RemoveAsync(Guid id, CancellationToken ct)
    {
        var key = KeyFor(id);
        try
        {
            await _cache.RemoveAsync(key, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _log.LogWarning(
                ex,
                "Cache invalidation failed for {Key}; downstream readers may see stale data "
                    + "until the TTL expires",
                key
            );
        }
    }

    private string KeyFor(Guid id)
    {
        var prefix = _opts.KeyPrefix.EndsWith(':') ? _opts.KeyPrefix : _opts.KeyPrefix + ":";
        return $"{prefix}task:{id:N}";
    }
}
