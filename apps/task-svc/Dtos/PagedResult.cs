namespace ShopNest.TaskSvc.Dtos;

/// <summary>
/// Generic envelope for paginated list endpoints. Returning the page metadata
/// alongside the items lets clients render "page X of Y" UIs without a
/// follow-up <c>HEAD</c> or <c>?count=true</c> request.
/// </summary>
public sealed record PagedResult<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    int TotalItems
)
{
    public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling(TotalItems / (double)PageSize);
}
