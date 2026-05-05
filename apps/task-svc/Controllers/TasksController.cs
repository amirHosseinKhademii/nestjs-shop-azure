using Microsoft.AspNetCore.Mvc;
using ShopNest.TaskSvc.Dtos;
using ShopNest.TaskSvc.Services;

namespace ShopNest.TaskSvc.Controllers;

[ApiController]
[Route("api/tasks")]
[Produces("application/json")]
public sealed class TasksController(ITaskService tasks) : ControllerBase
{
    /// <summary>List tasks with optional filtering and pagination.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<TaskResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<PagedResult<TaskResponse>>> List(
        [FromQuery] TaskQuery query,
        CancellationToken ct
    )
    {
        var result = await tasks.ListAsync(query, ct);
        return Ok(result);
    }

    /// <summary>Get a single task by id.</summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(TaskResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TaskResponse>> Get(Guid id, CancellationToken ct)
    {
        var found = await tasks.GetAsync(id, ct);
        return found is null ? NotFoundProblem(id) : Ok(found);
    }

    /// <summary>Create a new task.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(TaskResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<TaskResponse>> Create(
        [FromBody] CreateTaskRequest request,
        CancellationToken ct
    )
    {
        var created = await tasks.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    /// <summary>Replace an existing task.</summary>
    [HttpPut("{id:guid}")]
    [ProducesResponseType(typeof(TaskResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TaskResponse>> Update(
        Guid id,
        [FromBody] UpdateTaskRequest request,
        CancellationToken ct
    )
    {
        var updated = await tasks.UpdateAsync(id, request, ct);
        return updated is null ? NotFoundProblem(id) : Ok(updated);
    }

    /// <summary>Delete a task.</summary>
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var deleted = await tasks.DeleteAsync(id, ct);
        return deleted ? NoContent() : NotFoundProblem(id);
    }

    private ObjectResult NotFoundProblem(Guid id) =>
        Problem(
            title: "Task not found",
            detail: $"No task with id '{id}' exists.",
            statusCode: StatusCodes.Status404NotFound,
            type: "https://httpstatuses.io/404"
        );
}
