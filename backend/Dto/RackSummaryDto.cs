namespace WarehouseApi.Dto;

// Minimal rack reference (id + name only) used inside occupancy lists,
// where the full Rack entity isn't needed.
public class RackSummaryDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}
