using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WarehouseApi.Attributes;
using WarehouseApi.Models;
using WarehouseApi.Services;

namespace WarehouseApi.Controllers;

// Standard CRUD over roles - this is where an admin defines the dynamic
// permission sets (see Role/PermissionSet) that RequirePermission checks
// against on every other gated endpoint.
[ApiController]
[Authorize]
[Route("api/roles")]
public class RolesController : ControllerBase
{
    private readonly IRoleService _roleService;

    public RolesController(IRoleService roleService)
    {
        _roleService = roleService;
    }

    [HttpGet]
    [RequirePermission("Role", "Read")]
    public async Task<ActionResult<List<Role>>> GetAllAsync()
    {
        var roles = await _roleService.GetAllAsync();
        if(roles == null || roles.Count == 0)
        {
            return NotFound();
        }
        return Ok(roles);
    }

    [HttpGet("{id}")]
    [RequirePermission("Role", "Read")]
    public async Task<ActionResult<Role>> GetByIdAsync(string id)
    {
        var role = await _roleService.GetByIdAsync(id);
        if(role == null)
        {
            return NotFound();
        }
        return Ok(role);
    }

    [HttpPost]
    [RequirePermission("Role", "Create")]
    public async Task<ActionResult<Role>> Create([FromBody] Role role)
    {
        await _roleService.CreateAsync(role);
        return Ok(role);
    }

    [HttpPut("{id}")]
    [RequirePermission("Role", "Update")]
    public async Task<ActionResult> Update(string id, [FromBody] Role role)
    {
        var existing = await _roleService.GetByIdAsync(id);
        if(existing == null)
        {
            return NotFound();
        }
        role.Id = id; // Id comes from the route, not trusted from the body.
        await _roleService.UpdateAsync(role);
        return NoContent();
    }

    [HttpDelete("{id}")]
    [RequirePermission("Role", "Delete")]
    public async Task<ActionResult> Delete(string id)
    {
        var existing = await _roleService.GetByIdAsync(id);
        if(existing == null)
        {
            return NotFound();
        }
        await _roleService.DeleteAsync(id);
        return NoContent();
    }
}
