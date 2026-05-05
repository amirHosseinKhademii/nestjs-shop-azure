using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using ShopNest.TaskSvc.Caching;
using ShopNest.TaskSvc.Data;
using ShopNest.TaskSvc.Domain;
using ShopNest.TaskSvc.Dtos;

namespace ShopNest.TaskSvc.Services;

public sealed class TaskService(
    TasksDbContext db,
    TimeProvider clock,
    ITaskCache cache,
    ILogger<TaskService> log
) : ITaskService
{
    public async Task<PagedResult<TaskResponse>> ListAsync(TaskQuery query, CancellationToken ct)
    {
        // Build the query progressively so unfiltered calls don't push useless
        // predicates down to Postgres.
        IQueryable<TaskItem> q = db.Tasks.AsNoTracking();

        if (query.Status is { } status)
        {
            q = q.Where(t => t.Status == status);
        }

        if (query.Priority is { } priority)
        {
            q = q.Where(t => t.Priority == priority);
        }

        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            // ILIKE (case-insensitive) is mapped automatically by Npgsql when
            // we use EF.Functions.ILike. Falls back to ToLower() comparison on
            // providers that don't support it.
            var needle = $"%{query.Q.Trim()}%";
            q = q.Where(t =>
                EF.Functions.ILike(t.Title, needle)
                || (t.Description != null && EF.Functions.ILike(t.Description, needle))
            );
        }

        var totalItems = await q.CountAsync(ct);

        var items = await q.OrderByDescending(t => t.CreatedAt)
            .ThenBy(t => t.Id)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(t => TaskResponse.FromEntity(t))
            .ToListAsync(ct);

        return new PagedResult<TaskResponse>(items, query.Page, query.PageSize, totalItems);
    }

    public async Task<TaskResponse?> GetAsync(Guid id, CancellationToken ct)
    {
        // Cache-aside: try the distributed cache, fall back to DB on miss,
        // populate the cache for the next reader. Misses (or cache failures)
        // never fail the request — TaskCache logs and returns null on errors.
        var cached = await cache.GetAsync(id, ct);
        if (cached is not null)
        {
            return cached;
        }

        var entity = await db.Tasks.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct);
        if (entity is null)
        {
            return null;
        }

        var dto = TaskResponse.FromEntity(entity);
        await cache.SetAsync(dto, ct);
        return dto;
    }

    public async Task<TaskResponse> CreateAsync(CreateTaskRequest request, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var entity = new TaskItem
        {
            Id = Guid.NewGuid(),
            Title = request.Title.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description)
                ? null
                : request.Description.Trim(),
            Status = request.Status ?? TaskItemStatus.Todo,
            Priority = request.Priority ?? TaskItemPriority.Medium,
            DueDate = request.DueDate,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.Tasks.Add(entity);
        await db.SaveChangesAsync(ct);

        log.LogInformation("Created task {TaskId} ({Title})", entity.Id, entity.Title);
        return TaskResponse.FromEntity(entity);
    }

    public async Task<TaskResponse?> EnsureDeliveryTaskFromOrderAsync(
        OrderCreatedDeliveryCommand command,
        CancellationToken ct
    )
    {
        var now = clock.GetUtcNow();
        var description = JsonSerializer.Serialize(
            new
            {
                kind = "delivery",
                command.OrderId,
                command.UserId,
                command.CartId,
                command.CorrelationId,
                command.LineCount,
            }
        );

        var entity = new TaskItem
        {
            Id = command.OrderId,
            Title = $"Deliver order {command.OrderId}",
            Description = description,
            Status = TaskItemStatus.Todo,
            Priority = TaskItemPriority.High,
            DueDate = null,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.Tasks.Add(entity);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is PostgresException pg && pg.SqlState == "23505")
        {
            log.LogDebug(
                "Delivery task already exists for order {OrderId} (duplicate OrderCreated)",
                command.OrderId
            );
            return null;
        }

        log.LogInformation(
            "Created delivery task {TaskId} from OrderCreated (correlation {CorrelationId})",
            entity.Id,
            command.CorrelationId
        );
        return TaskResponse.FromEntity(entity);
    }

    public async Task<TaskResponse?> UpdateAsync(
        Guid id,
        UpdateTaskRequest request,
        CancellationToken ct
    )
    {
        var entity = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (entity is null)
        {
            return null;
        }

        entity.Title = request.Title.Trim();
        entity.Description = string.IsNullOrWhiteSpace(request.Description)
            ? null
            : request.Description.Trim();
        entity.Status = request.Status;
        entity.Priority = request.Priority;
        entity.DueDate = request.DueDate;
        entity.UpdatedAt = clock.GetUtcNow();

        await db.SaveChangesAsync(ct);

        // Invalidate AFTER the write commits — invalidating before would
        // race against concurrent readers who'd repopulate the cache with
        // pre-update data.
        await cache.RemoveAsync(entity.Id, ct);

        log.LogInformation("Updated task {TaskId}", entity.Id);
        return TaskResponse.FromEntity(entity);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct)
    {
        // ExecuteDeleteAsync issues a single DELETE without first SELECTing the
        // row into the change tracker. Returns the affected row count, which
        // doubles as the "did something get deleted?" signal.
        var affected = await db.Tasks.Where(t => t.Id == id).ExecuteDeleteAsync(ct);
        if (affected > 0)
        {
            await cache.RemoveAsync(id, ct);
            log.LogInformation("Deleted task {TaskId}", id);
        }
        return affected > 0;
    }
}
