using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WarehouseApi.Attributes;
using WarehouseApi.Models;
using WarehouseApi.Services;

namespace WarehouseApi.Controllers;

// Standard CRUD over zones. Every action is gated by RequirePermission,
// which checks the caller's role against the "Zone" entity before the
// method body runs at all.
[ApiController]
[Authorize]
[Route("api/zones")]
public class ZonesController : ControllerBase
{
    private readonly IZoneService _zoneService;

    public ZonesController(IZoneService zoneService)
    {
        _zoneService = zoneService;
    }

    [HttpGet]
    [RequirePermission("Zone", "Read")]
    public async Task<ActionResult<List<Zone>>> GetAll()
    {
        var zones = await _zoneService.GetAllAsync();
        // Empty result treated as 404 rather than an empty 200 list - kept
        // consistent across all the read endpoints in this app.
        if (zones == null || zones.Count == 0)
        {
            return NotFound();
        }
        return Ok(zones);
    }

    [HttpGet("{id}")]
    [RequirePermission("Zone", "Read")]
    public async Task<ActionResult<Zone>> GetById(string id)
    {
        var zone = await _zoneService.GetByIdAsync(id);
        if (zone == null)
        {
            return NotFound();
        }
        return Ok(zone);
    }

    [HttpPost]
    [RequirePermission("Zone", "Create")]
    public async Task<ActionResult<Zone>> Create([FromBody] Zone zone)
    {
        await _zoneService.CreateAsync(zone);
        // 201 Created, with a Location header pointing at GetById for the
        // new resource - standard REST convention for a create endpoint.
        return CreatedAtAction(nameof(GetById), new { id = zone.Id }, zone);
    }

    [HttpPut("{id}")]
    [RequirePermission("Zone", "Update")]
    public async Task<ActionResult> Update(string id, [FromBody] Zone zone)
    {
        var existing = await _zoneService.GetByIdAsync(id);
        if (existing == null)
        {
            return NotFound();
        }
        // Id always comes from the route, never trusted from the body -
        // prevents a client from "updating" a different zone than the URL says.
        zone.Id = id;
        await _zoneService.UpdateAsync(zone);
        return NoContent();
    }

    [HttpDelete("{id}")]
    [RequirePermission("Zone", "Delete")]
    public async Task<ActionResult> Delete(string id)
    {
        var existing = await _zoneService.GetByIdAsync(id);
        if (existing == null)
        {
            return NotFound();
        }
        await _zoneService.DeleteAsync(id);
        return NoContent();
    }
}
