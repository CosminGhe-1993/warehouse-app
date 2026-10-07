using WarehouseApi.Enums;

namespace WarehouseApi.Models;

// One entry in a Package's move history - who moved it, when, and
// from/where to where. Embedded directly in the Package document rather
// than a separate collection, since it's always read together with it.
public class PackageHistory
{
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string FromLocationId { get; set; } = string.Empty;
    public string ToLocationId { get; set; } = string.Empty;
    public LocationType FromLocationType { get; set; }
    public LocationType ToLocationType { get; set; }
    public string Note { get; set; } = string.Empty;
}