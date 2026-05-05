using Microsoft.AspNetCore.Mvc;

namespace ShopNest.TaskSvc.Hosting;

/// <summary>
/// Wires up RFC 7807 ProblemDetails for both framework-thrown errors
/// (validation, 404 from routing, exceptions) and explicitly-returned
/// <c>Problem(...)</c> results. Also overrides the model-binding error
/// pipeline so validation failures use the same shape.
/// </summary>
internal static class ProblemDetailsServiceCollectionExtensions
{
    public static IServiceCollection AddTaskProblemDetails(this IServiceCollection services)
    {
        services.AddProblemDetails(options =>
        {
            options.CustomizeProblemDetails = ctx =>
            {
                ctx.ProblemDetails.Extensions["traceId"] = ctx.HttpContext.TraceIdentifier;
                ctx.ProblemDetails.Extensions["instance"] = ctx.HttpContext.Request.Path.Value;
            };
        });

        // Returning RFC 7807 from model-binding/validation failures keeps
        // the error shape consistent with our explicit Problem(...) responses
        // in controllers.
        services.Configure<ApiBehaviorOptions>(options =>
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

        return services;
    }
}
