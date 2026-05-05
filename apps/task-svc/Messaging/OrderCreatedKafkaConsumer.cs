using System.Text.Json;
using Confluent.Kafka;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ShopNest.TaskSvc.Dtos;
using ShopNest.TaskSvc.Services;

namespace ShopNest.TaskSvc.Messaging;

/// <summary>
/// Subscribes to the <c>OrderCreated</c> topic and creates a delivery
/// <see cref="Domain.TaskItem"/> for each new order. Uses the same
/// <c>KAFKA_*</c> broker settings as the Nest stack.
/// </summary>
public sealed class OrderCreatedKafkaConsumer : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly IConsumer<string, string> _consumer;
    private readonly ConsumerConfig _consumerConfig;
    private readonly string _topic;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OrderCreatedKafkaConsumer> _log;

    public OrderCreatedKafkaConsumer(
        ConsumerConfig consumerConfig,
        IConfiguration configuration,
        IServiceScopeFactory scopeFactory,
        ILogger<OrderCreatedKafkaConsumer> log
    )
    {
        _consumerConfig = consumerConfig;
        _consumer = new ConsumerBuilder<string, string>(consumerConfig).Build();
        _scopeFactory = scopeFactory;
        _log = log;

        _topic =
            FirstNonBlank(
                configuration["Kafka:OrderCreated:Topic"],
                Environment.GetEnvironmentVariable("KAFKA_ORDER_EVENTS_TOPIC")
            ) ?? "order-events";
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _consumer.Subscribe(_topic);
        _log.LogInformation(
            "Kafka consumer subscribed to topic {Topic} (group {GroupId})",
            _topic,
            _consumerConfig.GroupId
        );

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                ConsumeResult<string, string>? cr = null;
                try
                {
                    cr = _consumer.Consume(TimeSpan.FromMilliseconds(800));
                }
                catch (ConsumeException ex)
                {
                    _log.LogError(ex, "Kafka ConsumeException");
                    await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
                    continue;
                }

                if (cr is null)
                {
                    continue;
                }

                if (cr.IsPartitionEOF)
                {
                    continue;
                }

                try
                {
                    await HandleMessageAsync(cr.Message.Value, stoppingToken);
                    _consumer.Commit(cr);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    // Don't commit — partition will retry. Poison messages may
                    // require manual intervention or a future DLQ handler.
                    _log.LogError(
                        ex,
                        "Failed processing Kafka message topic={Topic} partition={Partition} offset={Offset}",
                        cr.Topic,
                        cr.Partition.Value,
                        cr.Offset.Value
                    );
                    await Task.Delay(TimeSpan.FromMilliseconds(500), stoppingToken);
                }
            }
        }
        finally
        {
            try
            {
                _consumer.Close();
            }
            catch (Exception ex)
            {
                _log.LogDebug(ex, "Kafka consumer close suppressed");
            }

            _consumer.Dispose();
        }
    }

    private async Task HandleMessageAsync(string? json, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return;
        }

        OrderCreatedDeliveryMessage? dto;
        try
        {
            dto = JsonSerializer.Deserialize<OrderCreatedDeliveryMessage>(json, JsonOpts);
        }
        catch (JsonException ex)
        {
            _log.LogWarning(ex, "Skipping malformed JSON Kafka message");
            return;
        }

        if (dto is null || dto.EventType != "OrderCreated" || dto.SchemaVersion < 1)
        {
            _log.LogWarning("Skipping unsupported payload (eventType={EventType})", dto?.EventType);
            return;
        }

        if (
            !Guid.TryParse(dto.OrderId, out var orderId)
            || string.IsNullOrWhiteSpace(dto.UserId)
            || string.IsNullOrWhiteSpace(dto.CartId)
            || string.IsNullOrWhiteSpace(dto.CorrelationId)
        )
        {
            _log.LogWarning("Skipping OrderCreated with missing required fields");
            return;
        }

        var cmd = new OrderCreatedDeliveryCommand(
            orderId,
            dto.UserId.Trim(),
            dto.CartId.Trim(),
            dto.CorrelationId.Trim(),
            dto.LineCount
        );

        await using var scope = _scopeFactory.CreateAsyncScope();
        var tasks = scope.ServiceProvider.GetRequiredService<ITaskService>();
        await tasks.EnsureDeliveryTaskFromOrderAsync(cmd, ct);
    }

    private static string? FirstNonBlank(params string?[] candidates) =>
        candidates.FirstOrDefault(s => !string.IsNullOrWhiteSpace(s));
}
