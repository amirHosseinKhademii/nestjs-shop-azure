using Microsoft.EntityFrameworkCore;
using ShopNest.TaskSvc.Domain;

namespace ShopNest.TaskSvc.Data;

public sealed class TasksDbContext(DbContextOptions<TasksDbContext> options) : DbContext(options)
{
    public DbSet<TaskItem> Tasks => Set<TaskItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<TaskItem>(entity =>
        {
            entity.HasKey(t => t.Id);

            entity.Property(t => t.Title).IsRequired().HasMaxLength(200);

            entity.Property(t => t.Description).HasMaxLength(2000);

            entity
                .Property(t => t.Status)
                .HasConversion<string>()
                .HasMaxLength(32)
                .IsRequired();

            entity
                .Property(t => t.Priority)
                .HasConversion<string>()
                .HasMaxLength(16)
                .IsRequired();

            entity.Property(t => t.CreatedAt).IsRequired();
            entity.Property(t => t.UpdatedAt).IsRequired();

            entity.Property(t => t.Xmin).IsRowVersion().HasColumnName("xmin");

            entity.HasIndex(t => t.Status);
            entity.HasIndex(t => t.DueDate);
            entity.HasIndex(t => t.CreatedAt);
        });
    }
}
