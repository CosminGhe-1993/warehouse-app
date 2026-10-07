using WarehouseApi.Enums;

namespace WarehouseApi.Dto;

// One row in the "recent activity" feed - combines package moves and
// slot merges into a single, uniformly-shaped timeline entry, with
// location names already resolved (not just raw ids) for display.
public class RecentActivityDto
{
    public string PackageId { get; set; } = string.Empty;
    public string Recipient { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string FromLocationId { get; set; } = string.Empty;
    public LocationType FromLocationType { get; set; } = LocationType.Slot;
    public string FromLocationName { get; set; } = string.Empty;
    public string ToLocationId { get; set; } = string.Empty;
    public LocationType ToLocationType { get; set; } = LocationType.Slot;
    public string ToLocationName { get; set; } = string.Empty;
}