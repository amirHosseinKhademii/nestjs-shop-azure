using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ShopNest.TaskSvc.Data;

/// <summary>
/// Lets <c>dotnet ef migrations</c> instantiate the DbContext at design time
/// without booting the full ASP.NET Core host. Without this, EF tooling has to
/// invoke <c>Program.Main</c>, which can be slow or fail when env vars/secrets
/// aren't available on the developer's machine.
/// </summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<TasksDbContext>
{
    public TasksDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__Tasks")
            ?? "Host=localhost;Port=5433;Database=tasks;Username=tasks;Password=tasks";

        var options = new DbContextOptionsBuilder<TasksDbContext>()
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .Options;

        return new TasksDbContext(options);
    }
}
