using Microsoft.EntityFrameworkCore;
using ShopNest.TaskSvc.Domain;

namespace ShopNest.TaskSvc.Data;

public sealed class TasksDbContext(DbContextOptions<TasksDbContext> options) : DbContext(options)
{
    public DbSet<TaskItem> Tasks => Set<TaskItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Discover every IEntityTypeConfiguration<T> in this assembly and
        // apply it. Adding a new entity is a one-file change (a new
        // *Configuration.cs under Data/Configurations/) — the DbContext
        // never has to grow.
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TasksDbContext).Assembly);
    }
}
