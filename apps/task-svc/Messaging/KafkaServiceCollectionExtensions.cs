using Microsoft.Extensions.Configuration;

namespace ShopNest.TaskSvc.Messaging;

internal static class KafkaServiceCollectionExtensions
{
    public static IServiceCollection AddOrderCreatedKafkaConsumer(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        var cfg = KafkaConsumerConfiguration.TryCreate(configuration);
        if (cfg is null)
        {
            Console.WriteLine(
                "[task-svc] Kafka OrderCreated consumer disabled "
                    + "(set KAFKA_BROKERS and ensure KAFKA_ORDER_CONSUMER_ENABLED is not false)"
            );
            return services;
        }

        services.AddSingleton(cfg);
        services.AddHostedService<OrderCreatedKafkaConsumer>();
        return services;
    }
}
