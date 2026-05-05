using ShopNest.TaskSvc.Domain;

namespace ShopNest.TaskSvc.Dtos;

public sealed record TaskResponse(
    Guid Id,
    string Title,
    string? Description,
    TaskItemStatus Status,
    TaskItemPriority Priority,
    DateTimeOffset? DueDate,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt
)
{
    public static TaskResponse FromEntity(TaskItem entity) =>
        new(
            entity.Id,
            entity.Title,
            entity.Description,
            entity.Status,
            entity.Priority,
            entity.DueDate,
            entity.CreatedAt,
            entity.UpdatedAt
        );
}
