namespace ShopNest.TaskSvc.Dtos;

/// <summary>
/// Normalised input for idempotent delivery-task creation from Kafka.
/// </summary>
public sealed record OrderCreatedDeliveryCommand(
    Guid OrderId,
    string UserId,
    string CartId,
    string CorrelationId,
    int LineCount
);
