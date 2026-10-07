using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WarehouseApi.Dto;
using WarehouseApi.Services;

namespace WarehouseApi.Controllers;

// Single entry point for the natural-language assistant chat. This
// controller is deliberately thin - it just forwards the query to
// GroqService and returns whatever tool call(s) the AI decided on. It does
// NOT execute those tool calls itself; the frontend reads the Action field
// of each result and calls the appropriate existing endpoint to do the
// actual work (query MongoDB, navigate a screen).
[ApiController]
[Authorize]
[Route("api/assistant")]
public class AssistantController : ControllerBase
{
    private readonly IGroqService _groqService;

    public AssistantController(IGroqService groqService)
    {
        _groqService = groqService;
    }

    [HttpPost("query")]
    public async Task<ActionResult<List<AssistantResponseDto>>> Query([FromBody] AssistantQueryRequestDto request)
    {
        var result = await _groqService.InterpretQueryAsync(request.Query, request.History);
        return Ok(result);
    }
}
