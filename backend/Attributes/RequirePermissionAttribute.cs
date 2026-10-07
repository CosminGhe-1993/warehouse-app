using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using WarehouseApi.Services;

namespace WarehouseApi.Attributes;

// Endpoint-level permission gate, used as [RequirePermission("Package", "Read")]
// on controller actions. Implements the dynamic role/permission system: an
// admin defines roles with CRUD flags per entity (see Role/PermissionSet),
// and this attribute checks the caller's role against that at request time,
// instead of hardcoding permission checks inside each action.
[AttributeUsage(AttributeTargets.Method)]
public class RequirePermissionAttribute : ActionFilterAttribute
{
    private readonly string _entity;
    private readonly string _permission;

    public RequirePermissionAttribute(string entity, string permission)
    {
        _entity = entity;
        _permission = permission;
    }

    // Runs before the action method executes; short-circuits with
    // Unauthorized/Forbid instead of calling next() when the check fails.
    public override async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        // No roleId claim on the token at all -> not authenticated properly.
        var roleIdClaim = context.HttpContext.User.FindFirst("roleId");
        if (roleIdClaim == null)
        {
            context.Result = new UnauthorizedResult();
            return;
        }

        // Resolved manually via RequestServices instead of constructor
        // injection, since attribute instances are created by the
        // framework before DI runs for a given request.
        var roleService = context.HttpContext.RequestServices.GetRequiredService<IRoleService>();
        var role = await roleService.GetByIdAsync(roleIdClaim.Value);

        // Role doesn't exist anymore, or was never given any permissions
        // for this entity type at all -> forbidden.
        if (role == null || !role.Permissions.ContainsKey(_entity))
        {
            context.Result = new ForbidResult();
            return;
        }

        // Map the requested permission string ("Read"/"Create"/...) to the
        // matching boolean flag on the role's PermissionSet for this entity.
        var permSet = role.Permissions[_entity];
        var hasPermission = _permission switch
        {
            "Read" => permSet.CanRead,
            "Create" => permSet.CanCreate,
            "Update" => permSet.CanUpdate,
            "Delete" => permSet.CanDelete,
            _ => false
        };

        if (!hasPermission)
        {
            context.Result = new ForbidResult();
            return;
        }

        // Permission granted - let the actual action method run.
        await next();
    }
}
