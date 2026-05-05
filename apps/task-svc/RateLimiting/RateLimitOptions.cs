namespace ShopNest.TaskSvc.RateLimiting;

/// <summary>
/// Bound from the <c>RateLimiting</c> section of <c>appsettings.json</c>.
/// Two named policies are exposed: <c>read</c> for GETs and <c>write</c> for
/// mutating verbs. The values default to sane prototype-friendly numbers and
/// can be tuned per-environment without redeploy.
/// </summary>
public sealed class RateLimitOptions
{
    public const string SectionName = "RateLimiting";

    public WindowOptions Read { get; set; } = new() { PermitLimit = 100, WindowSeconds = 60 };

    public WindowOptions Write { get; set; } = new() { PermitLimit = 20, WindowSeconds = 60 };

    public sealed class WindowOptions
    {
        /// <summary>Max requests inside <see cref="WindowSeconds"/> per partition.</summary>
        public int PermitLimit { get; set; }

        /// <summary>Window length in seconds.</summary>
        public int WindowSeconds { get; set; }
    }
}
