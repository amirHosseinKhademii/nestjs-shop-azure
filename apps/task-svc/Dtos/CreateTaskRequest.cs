using System.ComponentModel.DataAnnotations;
using ShopNest.TaskSvc.Domain;

namespace ShopNest.TaskSvc.Dtos;

public sealed record CreateTaskRequest(
    [Required, StringLength(200, MinimumLength = 1)] string Title,
    [StringLength(2000)] string? Description,
    TaskItemStatus? Status,
    TaskItemPriority? Priority,
    DateTimeOffset? DueDate
);
