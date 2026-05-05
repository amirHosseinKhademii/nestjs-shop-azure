using ShopNest.TaskSvc.Dtos;

namespace ShopNest.TaskSvc.Services;

/// <summary>
/// Application-level operations for <see cref="Domain.TaskItem"/>. The
/// interface boundary keeps the controller free of EF Core types and makes
/// the service trivially substitutable in tests with an in-memory fake.
/// </summary>
public interface ITaskService
{
    Task<PagedResult<TaskResponse>> ListAsync(TaskQuery query, CancellationToken ct);

    Task<TaskResponse?> GetAsync(Guid id, CancellationToken ct);

    Task<TaskResponse> CreateAsync(CreateTaskRequest request, CancellationToken ct);

    /// <returns><c>null</c> when no row matches the supplied id.</returns>
    Task<TaskResponse?> UpdateAsync(Guid id, UpdateTaskRequest request, CancellationToken ct);

    /// <returns><c>true</c> when a row was deleted; <c>false</c> when none matched.</returns>
    Task<bool> DeleteAsync(Guid id, CancellationToken ct);
}
