using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Scalar.AspNetCore;
using ShopNest.TaskSvc.Caching;
using ShopNest.TaskSvc.Data;
using ShopNest.TaskSvc.Hosting;
using ShopNest.TaskSvc.Messaging;
using ShopNest.TaskSvc.RateLimiting;
using ShopNest.TaskSvc.Services;

// .env loading must happen before WebApplication.CreateBuilder so the
// resulting IConfiguration sees the variables.
EnvFileLoader.Load();

var builder = WebApplication.CreateBuilder(args);

// ─── Services ──────────────────────────────────────────────────────────────
builder
    .Services.AddControllers()
    // Serialize enums as their string names; the DB also stores them as
    // text (see TasksDbContext) so the wire format stays human-readable.
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<ITaskService, TaskService>();

builder.Services.AddTasksDatabase(builder.Configuration);
builder.Services.AddTaskProblemDetails();
builder.Services.AddTaskCors(builder.Configuration);
builder.Services.AddTaskCache(builder.Configuration);
builder.Services.AddTaskRateLimiting(builder.Configuration);
builder.Services.AddOrderCreatedKafkaConsumer(builder.Configuration);
builder.Services.AddOpenApi();

// ─── Pipeline ──────────────────────────────────────────────────────────────
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

// Health checks are mapped before the rate limiter middleware so
// orchestrator probes can never be throttled. Controller endpoints opt in
// to a named policy via [EnableRateLimiting("read"|"write")].
app.MapHealthChecks(
    "/health/ready",
    new HealthCheckOptions
    {
        Predicate = registration => registration.Tags.Contains("ready"),
        ResponseWriter = HealthEndpointWriter.WriteJsonAsync,
    }
);

app.UseRateLimiter();

app.MapControllers();

await app.ApplyDevelopmentMigrationsAsync();

app.Run();

// Make the implicit Program type visible to test projects (WebApplicationFactory).
public partial class Program;
