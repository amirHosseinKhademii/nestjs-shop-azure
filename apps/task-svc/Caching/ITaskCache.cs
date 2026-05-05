using ShopNest.TaskSvc.Dtos;

namespace ShopNest.TaskSvc.Caching;

/// <summary>
/// Read-through cache for individual <see cref="TaskResponse"/> entries.
///
/// Deliberately scoped to single-task lookups: list queries are not cached
/// because keying them on the full filter/page tuple makes invalidation
/// fragile, and the gain is small compared to a single GET-by-id which is
/// the natural hot path for any UI that loads `/tasks/:id` after navigating
/// from a list.
/// </summary>
public interface ITaskCache
{
    Task<TaskResponse?> GetAsync(Guid id, CancellationToken ct);

    Task SetAsync(TaskResponse value, CancellationToken ct);

    Task RemoveAsync(Guid id, CancellationToken ct);
}
