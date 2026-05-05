using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ShopNest.TaskSvc.Domain;

namespace ShopNest.TaskSvc.Data.Configurations;

/// <summary>
/// EF Core mapping for <see cref="TaskItem"/>. Owning the mapping in a
/// dedicated <see cref="IEntityTypeConfiguration{TEntity}"/> keeps the
/// <see cref="TasksDbContext"/> short and forces every per-entity decision
/// (column types, indexes, concurrency tokens) to live next to a single
/// type — easier to review, easier to test in isolation.
///
/// Picked up automatically by
/// <c>modelBuilder.ApplyConfigurationsFromAssembly(...)</c>; no manual
/// registration needed when adding new entities.
/// </summary>
internal sealed class TaskItemConfiguration : IEntityTypeConfiguration<TaskItem>
{
    public void Configure(EntityTypeBuilder<TaskItem> entity)
    {
        entity.HasKey(t => t.Id);

        entity.Property(t => t.Title).IsRequired().HasMaxLength(200);

        entity.Property(t => t.Description).HasMaxLength(2000);

        // Status/Priority are persisted as text (not int) for readability in
        // psql and so renaming an enum member is a code-only change rather
        // than a data migration.
        entity.Property(t => t.Status).HasConversion<string>().HasMaxLength(32).IsRequired();

        entity.Property(t => t.Priority).HasConversion<string>().HasMaxLength(16).IsRequired();

        entity.Property(t => t.CreatedAt).IsRequired();
        entity.Property(t => t.UpdatedAt).IsRequired();

        // Postgres system column `xmin` mapped as the concurrency token. The
        // Npgsql provider knows this column name and emits the right
        // `WHERE xmin = @p` clause on updates. The EF property is explicitly
        // pointed at the `xmin` column so the snake_case naming convention
        // doesn't rename it.
        entity.Property(t => t.Xmin).IsRowVersion().HasColumnName("xmin");

        // Indexes match the most common access patterns:
        //   - filter-by-status on list endpoints,
        //   - upcoming-due queries,
        //   - "newest first" ordering used by the default list query.
        entity.HasIndex(t => t.Status);
        entity.HasIndex(t => t.DueDate);
        entity.HasIndex(t => t.CreatedAt);
    }
}
