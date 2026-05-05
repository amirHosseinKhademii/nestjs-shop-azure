namespace ShopNest.TaskSvc.Hosting;

/// <summary>
/// Loads <c>.env</c> files into the process environment before the
/// <see cref="Microsoft.Extensions.Configuration.IConfiguration"/> pipeline
/// runs. Mirrors the Nest services' convention (see
/// <c>packages/shared/src/env.ts</c>) so the whole monorepo behaves the same
/// way at startup.
/// </summary>
internal static class EnvFileLoader
{
    /// <summary>
    /// Walks up from the current working directory until it finds the
    /// <c>pnpm-workspace.yaml</c> marker, then loads (in priority order):
    /// <list type="number">
    ///   <item><description>Process env (already exported by the shell / orchestrator).</description></item>
    ///   <item><description><c>apps/task-svc/.env</c> (service-local override).</description></item>
    ///   <item><description><c>&lt;repo-root&gt;/.env</c> (shared with the Nest stack).</description></item>
    /// </list>
    /// Skipped silently when neither file exists — production deploys are
    /// expected to inject env vars directly through their orchestrator
    /// (e.g. Kubernetes Secrets).
    /// </summary>
    public static void Load()
    {
        var repoRoot = FindRepoRoot();

        // `clobberExistingVars: false` means whatever's already in the env is
        // never overwritten, so we get the precedence above by loading the
        // most specific file first and the most general last.
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
            if (!File.Exists(path))
            {
                continue;
            }
            DotNetEnv.Env.Load(
                path,
                new DotNetEnv.LoadOptions(setEnvVars: true, clobberExistingVars: false)
            );
            Console.WriteLine($"[task-svc] loaded env from {path}");
            loaded++;
        }

        if (loaded == 0)
        {
            Console.WriteLine(
                "[task-svc] no .env file found; relying on existing process env vars."
            );
        }
    }

    private static string? FindRepoRoot()
    {
        var dir = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "pnpm-workspace.yaml")))
            {
                return dir.FullName;
            }
            dir = dir.Parent;
        }
        return null;
    }
}
