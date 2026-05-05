namespace ShopNest.TaskSvc.Domain;

/// <summary>
/// Aggregate root for a unit of work tracked by this service.
///
/// Naming note: the type is <c>TaskItem</c> rather than <c>Task</c> to avoid
/// shadowing <see cref="System.Threading.Tasks.Task"/>, which would force every
/// async method that references it to use a fully-qualified return type.
/// </summary>
public sealed class TaskItem
{
    public Guid Id { get; init; }

    public required string Title { get; set; }

    public string? Description { get; set; }

    public TaskItemStatus Status { get; set; } = TaskItemStatus.Todo;

    public TaskItemPriority Priority { get; set; } = TaskItemPriority.Medium;

    public DateTimeOffset? DueDate { get; set; }

    public DateTimeOffset CreatedAt { get; init; }

    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>
    /// Postgres system column <c>xmin</c>, mapped as a concurrency token by
    /// EF Core's Npgsql provider. Updates that target a stale row will throw
    /// <see cref="Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException"/>,
    /// which the controller surfaces as <c>409 Conflict</c>.
    /// </summary>
    public uint Xmin { get; private set; }
}
