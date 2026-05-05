using Confluent.Kafka;
using Microsoft.Extensions.Configuration;

namespace ShopNest.TaskSvc.Messaging;

/// <summary>
/// Maps the same <c>KAFKA_*</c> environment variables the Nest services use
/// (same semantics as <c>packages/shared/src/kafka.ts</c> in this repo) onto Confluent's consumer
/// configuration for parity across runtimes.
/// </summary>
internal static class KafkaConsumerConfiguration
{
    public static ConsumerConfig? TryCreate(IConfiguration configuration)
    {
        var brokers = FirstNonBlank(
            configuration["KAFKA_BROKERS"],
            Environment.GetEnvironmentVariable("KAFKA_BROKERS")
        );
        if (string.IsNullOrWhiteSpace(brokers))
        {
            return null;
        }

        var explicitDisable = FirstNonBlank(
            configuration["KAFKA_ORDER_CONSUMER_ENABLED"],
            Environment.GetEnvironmentVariable("KAFKA_ORDER_CONSUMER_ENABLED")
        );
        if (string.Equals(explicitDisable, "false", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var groupId =
            FirstNonBlank(
                configuration["KAFKA_TASK_SVC_GROUP_ID"],
                Environment.GetEnvironmentVariable("KAFKA_TASK_SVC_GROUP_ID")
            ) ?? "task-svc";

        var c = new ConsumerConfig
        {
            BootstrapServers = brokers,
            GroupId = groupId,
            ClientId = "task-svc-order-created",
            AutoOffsetReset = AutoOffsetReset.Latest,
            EnableAutoCommit = false,
            EnablePartitionEof = true,
        };

        var sslFalse = string.Equals(
            FirstNonBlank(configuration["KAFKA_SSL"], Environment.GetEnvironmentVariable("KAFKA_SSL")),
            "false",
            StringComparison.OrdinalIgnoreCase
        );

        if (sslFalse)
        {
            c.SecurityProtocol = SecurityProtocol.Plaintext;
            return c;
        }

        var user = FirstNonBlank(configuration["KAFKA_USERNAME"], Environment.GetEnvironmentVariable("KAFKA_USERNAME"));
        var pass = FirstNonBlank(configuration["KAFKA_PASSWORD"], Environment.GetEnvironmentVariable("KAFKA_PASSWORD"));
        var ca = FirstNonBlank(configuration["KAFKA_SSL_CA"], Environment.GetEnvironmentVariable("KAFKA_SSL_CA"));
        var cert = FirstNonBlank(configuration["KAFKA_SSL_CERT"], Environment.GetEnvironmentVariable("KAFKA_SSL_CERT"));
        var key = FirstNonBlank(configuration["KAFKA_SSL_KEY"], Environment.GetEnvironmentVariable("KAFKA_SSL_KEY"));

        // Aiven default is **mTLS** (CA + service certificate + private key). This branch
        // MUST run before SASL: many `.env` files also define USERNAME/PASSWORD for the
        // console UI — we still want client cert authentication when all three PEMs exist.
        if (!string.IsNullOrEmpty(ca) && !string.IsNullOrEmpty(cert) && !string.IsNullOrEmpty(key))
        {
            c.SecurityProtocol = SecurityProtocol.Ssl;
            c.SslCaLocation = KafkaSslPemFiles.WriteOnce("ca", ca);
            c.SslCertificateLocation = KafkaSslPemFiles.WriteOnce("cert", cert);
            c.SslKeyLocation = KafkaSslPemFiles.WriteOnce("key", key);
            ApplySslEndpointIdentificationAlgorithm(c, configuration);
            return c;
        }

        if (!string.IsNullOrEmpty(user) && !string.IsNullOrEmpty(pass))
        {
            c.SecurityProtocol = SecurityProtocol.SaslSsl;
            c.SaslUsername = user;
            c.SaslPassword = pass;
            var mech = (
                FirstNonBlank(
                    configuration["KAFKA_SASL_MECHANISM"],
                    Environment.GetEnvironmentVariable("KAFKA_SASL_MECHANISM")
                ) ?? "scram-sha-256"
            ).ToLowerInvariant();
            c.SaslMechanism = mech switch
            {
                "plain" => SaslMechanism.Plain,
                "scram-sha-512" => SaslMechanism.ScramSha512,
                _ => SaslMechanism.ScramSha256,
            };
            if (!string.IsNullOrEmpty(ca))
            {
                c.SslCaLocation = KafkaSslPemFiles.WriteOnce("ca", ca);
            }

            ApplySslEndpointIdentificationAlgorithm(c, configuration);
            return c;
        }

        if (!string.IsNullOrEmpty(ca))
        {
            c.SecurityProtocol = SecurityProtocol.Ssl;
            c.SslCaLocation = KafkaSslPemFiles.WriteOnce("ca", ca);
        }
        else
        {
            c.SecurityProtocol = SecurityProtocol.Ssl;
        }

        ApplySslEndpointIdentificationAlgorithm(c, configuration);
        return c;
    }

    /// <summary>Optional hostname verification override (<c>none</c> | <c>https</c>).</summary>
    private static void ApplySslEndpointIdentificationAlgorithm(
        ConsumerConfig c,
        IConfiguration configuration
    )
    {
        var raw = FirstNonBlank(
            configuration["KAFKA_SSL_ENDPOINT_IDENTIFICATION_ALGORITHM"],
            Environment.GetEnvironmentVariable("KAFKA_SSL_ENDPOINT_IDENTIFICATION_ALGORITHM")
        );
        if (string.IsNullOrWhiteSpace(raw))
        {
            return;
        }

        switch (raw.Trim().ToLowerInvariant())
        {
            case "none":
                c.SslEndpointIdentificationAlgorithm = SslEndpointIdentificationAlgorithm.None;
                break;
            case "https":
                c.SslEndpointIdentificationAlgorithm = SslEndpointIdentificationAlgorithm.Https;
                break;
        }
    }

    private static string? FirstNonBlank(params string?[] candidates) =>
        candidates.FirstOrDefault(s => !string.IsNullOrWhiteSpace(s));
}
