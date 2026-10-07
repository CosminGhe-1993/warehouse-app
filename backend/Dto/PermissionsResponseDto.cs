namespace WarehouseApi.Dto;

// Flattened permission set sent to the frontend after login, e.g.
// "Package:Read", "Slot:Update" - lets the UI show/hide actions without
// re-checking the role on every click.
public class PermissionsResponseDto
{
    public HashSet<string> Permissions { get; set; } = new HashSet<string>();
}
