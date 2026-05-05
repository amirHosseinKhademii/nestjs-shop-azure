using Microsoft.EntityFrameworkCore;
using ShopNest.TaskSvc.Data;

namespace ShopNest.TaskSvc.Hosting;

/// <summary>
/// Startup-time hook that applies pending EF Core migrations.
/// Auto-migration runs in <c>Development</c> only — Production deployments
/// should run migrations as a separate job (e.g. an init container or a
/// one-off pipeline step) so app pods stay stateless and replica startup
/// doesn't race the migrator.
/// </summary>
internal static class MigrationStartupExtensions
{
    public static async Task ApplyDevelopmentMigrationsAsync(this WebApplication app)
    {
        if (!app.Environment.IsDevelopment())
        {
            return;
        }

        var log = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TasksDbContext>();
        try
        {
            log.LogInformation("Applying EF Core migrations ...");
            await db.Database.MigrateAsync();
            log.LogInformation("Migrations applied successfully.");
        }
        catch (Exception ex)
        {
            log.LogError(
                ex,
                "Migration failed. Verify TASK_DATABASE_URL points at a reachable Postgres "
                    + "and that the DB user can CREATE TABLE."
            );
            throw;
        }
    }
}
