namespace ShopNest.TaskSvc.Hosting;

/// <summary>
/// CORS policy bound from <c>Cors:AllowedOrigins</c>. Permissive default
/// (allow any origin) is intended for local development only — production
/// deployments must populate the array explicitly.
/// </summary>
internal static class CorsServiceCollectionExtensions
{
    public static IServiceCollection AddTaskCors(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        return services.AddCors(options =>
        {
            options.AddDefaultPolicy(policy =>
            {
                var origins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
                if (origins.Length == 0)
                {
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
    }
}
