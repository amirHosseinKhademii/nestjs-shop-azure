using System.Text.Json.Serialization;

namespace ShopNest.TaskSvc.Dtos;

/// <summary>
/// Wire JSON shape for <c>OrderCreated</c> published by <c>order-svc</c>
/// (see <c>apps/order-svc/src/order-events.types.ts</c>). Kept in sync manually —
/// if you change one side, mirror the other or introduce a shared schema
/// registry later.
/// </summary>
public sealed class OrderCreatedDeliveryMessage
{
    [JsonPropertyName("eventType")]
    public string? EventType { get; set; }

    [JsonPropertyName("schemaVersion")]
    public int SchemaVersion { get; set; }

    [JsonPropertyName("occurredAt")]
    public string? OccurredAt { get; set; }

    [JsonPropertyName("orderId")]
    public string? OrderId { get; set; }

    [JsonPropertyName("userId")]
    public string? UserId { get; set; }

    [JsonPropertyName("cartId")]
    public string? CartId { get; set; }

    [JsonPropertyName("correlationId")]
    public string? CorrelationId { get; set; }

    [JsonPropertyName("lineCount")]
    public int LineCount { get; set; }
}
