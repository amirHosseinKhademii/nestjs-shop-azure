using Microsoft.AspNetCore.Mvc;

namespace ShopNest.TaskSvc.Controllers;

/// <summary>
/// Mirrors the <c>/health/live</c> + <c>/health/ready</c> split used by the
/// other services in this monorepo (see <c>apps/order-svc/src/health.controller.ts</c>).
/// The "ready" probe is wired up in <c>Program.cs</c> via the built-in
/// <c>HealthChecksMiddleware</c> and includes a Postgres ping.
/// </summary>
[ApiController]
[Route("health")]
public sealed class HealthController : ControllerBase
{
    [HttpGet("live")]
    public IActionResult Live() => Ok(new { status = "ok" });
}
