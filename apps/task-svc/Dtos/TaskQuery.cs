using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using ShopNest.TaskSvc.Domain;

namespace ShopNest.TaskSvc.Dtos;

/// <summary>
/// Query-string parameters for <c>GET /api/tasks</c>. Bound from the URL by
/// model binding — properties (not constructor params) are required so that
/// missing values fall back to the defaults below instead of failing binding.
/// </summary>
public sealed class TaskQuery
{
    [Range(1, int.MaxValue)]
    [DefaultValue(1)]
    public int Page { get; init; } = 1;

    [Range(1, 100)]
    [DefaultValue(20)]
    public int PageSize { get; init; } = 20;

    public TaskItemStatus? Status { get; init; }

    public TaskItemPriority? Priority { get; init; }

    /// <summary>Case-insensitive substring match on title or description.</summary>
    [StringLength(100)]
    public string? Q { get; init; }
}
