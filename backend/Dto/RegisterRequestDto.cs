using WarehouseApi.Enums;

namespace WarehouseApi.Dto;

// Body of POST /api/auth/register - RoleId assigns the new user's
// permission set at creation time.
public class RegisterRequestDto
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string RoleId { get; set; } = string.Empty;
}