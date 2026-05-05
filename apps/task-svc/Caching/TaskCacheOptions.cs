namespace ShopNest.TaskSvc.Caching;

/// <summary>
/// Bound from the <c>Caching</c> section of <c>appsettings.json</c>.
/// </summary>
public sealed class TaskCacheOptions
{
    public const string SectionName = "Caching";

    /// <summary>
    /// Prefix for every cache key written by this service. Keeps keys
    /// segregated from the Nest stack which shares the same Redis instance
    /// in this repo (Upstash). Trailing colon is added automatically if not
    /// present.
    /// </summary>
    public string KeyPrefix { get; set; } = "task-svc:";

    /// <summary>Sliding TTL applied to every cached entry, in seconds.</summary>
    public int TtlSeconds { get; set; } = 300;
}
