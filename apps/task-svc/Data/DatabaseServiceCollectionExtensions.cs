using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace ShopNest.TaskSvc.Data;

/// <summary>
/// Resolves the Postgres connection string from configuration / env, hardens
/// it (URI → key/value, defensive timeout), then registers
/// <see cref="TasksDbContext"/> + the Npgsql health-check.
/// </summary>
internal static class DatabaseServiceCollectionExtensions
{
    public static IServiceCollection AddTasksDatabase(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        var connectionString = ResolveConnectionString(configuration);

        services.AddDbContext<TasksDbContext>(options =>
            options.UseNpgsql(connectionString).UseSnakeCaseNamingConvention()
        );

        services.AddHealthChecks().AddNpgSql(connectionString, name: "postgres", tags: ["ready"]);

        return services;
    }

    /// <summary>
    /// Resolution order, first non-blank wins:
    /// <list type="number">
    ///   <item><description><c>ConnectionStrings:Tasks</c> (appsettings.json or user-secrets)</description></item>
    ///   <item><description><c>TASK_DATABASE_URL</c> env var (preferred — matches the
    ///     <c>DATABASE_URL</c> pattern used by user-svc / order-svc / shop-svc)</description></item>
    /// </list>
    /// We fail fast at startup, because a missing connection string is never
    /// a recoverable runtime condition. Empty/whitespace values are treated
    /// as missing so an unset key in <c>.env</c> (e.g. <c>TASK_DATABASE_URL=</c>)
    /// doesn't slip through and surface later as an opaque Npgsql error.
    /// </summary>
    private static string ResolveConnectionString(IConfiguration configuration)
    {
        var raw =
            FirstNonBlank(
                configuration.GetConnectionString("Tasks"),
                Environment.GetEnvironmentVariable("TASK_DATABASE_URL")
            )
            ?? throw new InvalidOperationException(
                "Missing connection string. Set TASK_DATABASE_URL in the repo-root .env "
                    + "(or apps/task-svc/.env, or your shell), or set "
                    + "ConnectionStrings__Tasks if you need an explicit override."
            );

        var normalized = NormalizeUri(raw);

        // Defensively cap the connection timeout so that misconfigured
        // connection strings fail fast (default Npgsql is 15s but we want a
        // clear error within a few seconds during dev). Idempotent — never
        // overrides a user-provided `Timeout=` value.
        var probe = new NpgsqlConnectionStringBuilder(normalized);
        if (probe.Timeout == 15)
        {
            probe.Timeout = 8;
        }

        Console.WriteLine(
            $"[task-svc] resolved DB → Host={probe.Host} Port={probe.Port} Database={probe.Database} "
                + $"User={probe.Username} SslMode={probe.SslMode} Timeout={probe.Timeout}s"
        );

        return probe.ConnectionString;
    }

    private static string? FirstNonBlank(params string?[] candidates) =>
        candidates.FirstOrDefault(s => !string.IsNullOrWhiteSpace(s));

    /// <summary>
    /// Accept both libpq URI form (<c>postgresql://user:pass@host/db?sslmode=require</c>)
    /// and Npgsql key/value form (<c>Host=...;Username=...</c>). Npgsql does
    /// NOT parse libpq URIs natively — it treats the whole URL as a single
    /// key/value pair and throws — so we convert here.
    /// </summary>
    private static string NormalizeUri(string raw)
    {
        // Trims surrounding quotes that .env parsers occasionally leave behind.
        var trimmed = raw.Trim().Trim('"', '\'');

        var isUri =
            trimmed.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase);
        if (!isUri)
        {
            return trimmed;
        }

        var uri = new Uri(trimmed);
        var userInfo = uri.UserInfo.Split(':', 2);
        var user = Uri.UnescapeDataString(userInfo[0]);
        var pass = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty;

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort ? 5432 : uri.Port,
            Database = uri.AbsolutePath.TrimStart('/'),
            Username = user,
            Password = pass,
        };

        // Forward libpq query params (sslmode, channel_binding, etc.) to the
        // Npgsql builder. Unknown keys are silently dropped — the libpq URI
        // grammar is a superset of what Npgsql understands and we'd rather
        // boot than 500 on an unrecognised tuning knob.
        foreach (
            var pair in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries)
        )
        {
            var idx = pair.IndexOf('=');
            if (idx < 0)
            {
                continue;
            }
            var key = pair[..idx];
            var value = Uri.UnescapeDataString(pair[(idx + 1)..]);
            try
            {
                builder[key] = value;
            }
            catch (KeyNotFoundException)
            {
                // libpq-only knob (e.g. `application_name` aliases); safe to ignore.
            }
            catch (ArgumentException)
            {
                // value couldn't be coerced to the expected enum — same handling.
            }
        }

        return builder.ConnectionString;
    }
}
