namespace ShopNest.TaskSvc.Domain;

/// <summary>
/// Lifecycle state of a <see cref="TaskItem"/>. Persisted as text in Postgres
/// (via EF Core's value conversion) so DB rows stay readable when querying with
/// <c>psql</c> — at the cost of a few extra bytes per row, which is negligible
/// for a CRUD-scale workload.
///
/// Named <c>TaskItemStatus</c> rather than <c>TaskStatus</c> to avoid colliding
/// with <see cref="System.Threading.Tasks.TaskStatus"/>, which is implicitly
/// imported via the SDK's <c>ImplicitUsings</c> feature.
/// </summary>
public enum TaskItemStatus
{
    Todo,
    InProgress,
    Done,
}
