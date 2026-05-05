using System.ComponentModel.DataAnnotations;
using ShopNest.TaskSvc.Domain;

namespace ShopNest.TaskSvc.Dtos;

/// <summary>
/// Replaces the entire mutable surface of a task. Fields that aren't sent are
/// reset to their default — use PATCH semantics on the client if you only want
/// to mutate one column. Keeping PUT strict avoids accidental clobbers from
/// stale UI state.
/// </summary>
public sealed record UpdateTaskRequest(
    [Required, StringLength(200, MinimumLength = 1)] string Title,
    [StringLength(2000)] string? Description,
    [Required] TaskItemStatus Status,
    [Required] TaskItemPriority Priority,
    DateTimeOffset? DueDate
);
