using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Npgsql;
using Scalar.AspNetCore;
using ShopNest.TaskSvc.Data;
using ShopNest.TaskSvc.Services;

// ─── .env loading ───────────────────────────────────────────────────────────
// Mirrors the Nest services' convention (see packages/shared/src/env.ts):
//   1. <repo-root>/.env   ← shared with all services
//   2. apps/task-svc/.env ← service-local override
// First-found-wins, matching @nestjs/config behaviour. Skipped silently when
// neither file exists (production deploys are expected to inject env vars
// directly through their orchestrator, e.g. Kubernetes Secrets).
LoadEnvFiles();

var builder = WebApplication.CreateBuilder(args);

// ─── Config ─────────────────────────────────────────────────────────────────
// Connection-string resolution order:
//   1. Configuration["ConnectionStrings:Tasks"] (appsettings.json / secrets)
//   2. ConnectionStrings__Tasks env var (rare, mostly for k8s overrides)
//   3. TASK_DATABASE_URL env var (preferred — matches DATABASE_URL pattern
//      used by user-svc / order-svc / shop-svc)
// We fail fast at startup, because a missing connection string is never a
// recoverable runtime condition. Empty/whitespace values are treated as
// missing so an unset key in .env (e.g. `TASK_DATABASE_URL=`) doesn't slip
// through and surface later as an opaque Npgsql error.
static string? FirstNonBlank(params string?[] candidates) =>
    candidates.FirstOrDefault(s => !string.IsNullOrWhiteSpace(s));

var connectionString =
    FirstNonBlank(
        builder.Configuration.GetConnectionString("Tasks"),
        Environment.GetEnvironmentVariable("TASK_DATABASE_URL")
    )
    ?? throw new InvalidOperationException(
        "Missing connection string. Set TASK_DATABASE_URL in the repo-root .env "
            + "(or apps/task-svc/.env, or your shell), or set "
            + "ConnectionStrings__Tasks if you need an explicit override."
    );

connectionString = NormalizePostgresConnectionString(connectionString);

// Defensively cap the connection timeout so that misconfigured connection
// strings fail fast (default Npgsql is 15s but we want a clear error within
// a few seconds during dev). Idempotent — never overrides a user-provided
// `Timeout=` value.
{
    var probe = new NpgsqlConnectionStringBuilder(connectionString);
    if (probe.Timeout == 15)
    {
        probe.Timeout = 8;
    }
    connectionString = probe.ConnectionString;
    Console.WriteLine(
        $"[task-svc] resolved DB → Host={probe.Host} Port={probe.Port} Database={probe.Database} "
            + $"User={probe.Username} SslMode={probe.SslMode} Timeout={probe.Timeout}s"
    );
}

// ─── Services ───────────────────────────────────────────────────────────────
builder
    .Services.AddControllers()
    .AddJsonOptions(o =>
    {
        // Serialize enums as their string names; the DB also stores them as
        // text (see TasksDbContext) so the wire format stays human-readable.
        o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

builder.Services.AddDbContext<TasksDbContext>(options =>
    options.UseNpgsql(connectionString).UseSnakeCaseNamingConvention()
);

builder.Services.AddScoped<ITaskService, TaskService>();
builder.Services.AddSingleton(TimeProvider.System);

// RFC 7807 ProblemDetails for both framework-thrown errors (validation,
// 404 from routing, exceptions) and explicitly-returned Problem(...) results.
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = ctx =>
    {
        ctx.ProblemDetails.Extensions["traceId"] = ctx.HttpContext.TraceIdentifier;
        ctx.ProblemDetails.Extensions["instance"] = ctx.HttpContext.Request.Path.Value;
    };
});

// Returning RFC 7807 from model-binding/validation failures keeps the error
// shape consistent with our explicit Problem(...) responses in controllers.
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = context =>
    {
        var problem = new ValidationProblemDetails(context.ModelState)
        {
            Status = StatusCodes.Status400BadRequest,
            Title = "One or more validation errors occurred.",
            Type = "https://httpstatuses.io/400",
        };
        problem.Extensions["traceId"] = context.HttpContext.TraceIdentifier;
        return new BadRequestObjectResult(problem)
        {
            ContentTypes = { "application/problem+json" },
        };
    };
});

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var origins =
            builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        if (origins.Length == 0)
        {
            // Permissive default for local development only — production
            // deployments must set Cors:AllowedOrigins explicitly.
            policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
        }
        else
        {
            policy
                .WithOrigins(origins)
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials();
        }
    });
});

builder
    .Services.AddHealthChecks()
    .AddNpgSql(connectionString, name: "postgres", tags: ["ready"]);

builder.Services.AddOpenApi();

// ─── Pipeline ───────────────────────────────────────────────────────────────
var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(); // GET /scalar
}
else
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.UseCors();

app.MapHealthChecks(
    "/health/ready",
    new HealthCheckOptions
    {
        Predicate = registration => registration.Tags.Contains("ready"),
        ResponseWriter = WriteJsonHealthResponse,
    }
);

app.MapControllers();

// On startup in Development we apply migrations automatically so a fresh
// clone produces a working schema without an extra manual step. In
// Production, migrations should run as a separate job (e.g. an init
// container or a one-off pipeline step) so app pods stay stateless and
// replica startup doesn't race the migrator.
if (app.Environment.IsDevelopment())
{
    var startupLog = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<TasksDbContext>();
    try
    {
        startupLog.LogInformation("Applying EF Core migrations ...");
        await db.Database.MigrateAsync();
        startupLog.LogInformation("Migrations applied successfully.");
    }
    catch (Exception ex)
    {
        startupLog.LogError(
            ex,
            "Migration failed. Verify TASK_DATABASE_URL points at a reachable Postgres "
                + "and that the DB user can CREATE TABLE."
        );
        throw;
    }
}

app.Run();

static void LoadEnvFiles()
{
    // Walk up from the current working directory until we find the
    // pnpm-workspace.yaml marker (or run out of parents). Works for
    // `dotnet run --project apps/task-svc` from the repo root, for IDE
    // launches that cd into apps/task-svc, and for tests.
    var dir = new DirectoryInfo(Directory.GetCurrentDirectory());
    string? repoRoot = null;
    while (dir != null)
    {
        if (File.Exists(Path.Combine(dir.FullName, "pnpm-workspace.yaml")))
        {
            repoRoot = dir.FullName;
            break;
        }
        dir = dir.Parent;
    }

    // Precedence (highest wins):
    //   1. Process env (already exported by the shell / orchestrator).
    //   2. apps/task-svc/.env (service-local override).
    //   3. <repo-root>/.env  (shared with the Nest stack).
    //
    // `clobberExistingVars: false` means whatever's already in the env is
    // never overwritten, so we get the precedence above by loading the most
    // specific file first and the most general last.
    var candidates = new List<string>();
    if (repoRoot is not null)
    {
        candidates.Add(Path.Combine(repoRoot, "apps", "task-svc", ".env"));
        candidates.Add(Path.Combine(repoRoot, ".env"));
    }
    else
    {
        candidates.Add(Path.Combine(Directory.GetCurrentDirectory(), ".env"));
    }

    var loaded = 0;
    foreach (var path in candidates)
    {
        if (File.Exists(path))
        {
            DotNetEnv.Env.Load(
                path,
                new DotNetEnv.LoadOptions(setEnvVars: true, clobberExistingVars: false)
            );
            Console.WriteLine($"[task-svc] loaded env from {path}");
            loaded++;
        }
    }

    if (loaded == 0)
    {
        Console.WriteLine(
            "[task-svc] no .env file found; relying on existing process env vars."
        );
    }
}

static string NormalizePostgresConnectionString(string raw)
{
    // Accept both libpq URI form (`postgresql://user:pass@host/db?sslmode=require`)
    // and Npgsql key/value form (`Host=...;Username=...`). Npgsql does NOT
    // parse libpq URIs natively — it treats the whole URL as a single key/value
    // pair and throws — so we convert here.
    //
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
    // grammar is a superset of what Npgsql understands and we'd rather boot
    // than 500 on an unrecognised tuning knob.
    foreach (var pair in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
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

static Task WriteJsonHealthResponse(HttpContext ctx, HealthReport report)
{
    ctx.Response.ContentType = "application/json; charset=utf-8";
    var payload = JsonSerializer.SerializeToUtf8Bytes(
        new
        {
            status = report.Status.ToString(),
            totalDuration = report.TotalDuration.TotalMilliseconds,
            checks = report.Entries.Select(e => new
            {
                name = e.Key,
                status = e.Value.Status.ToString(),
                durationMs = e.Value.Duration.TotalMilliseconds,
                error = e.Value.Exception?.Message,
            }),
        }
    );
    return ctx.Response.Body.WriteAsync(payload, 0, payload.Length);
}

// Make the implicit Program type visible to test projects (WebApplicationFactory).
public partial class Program;
