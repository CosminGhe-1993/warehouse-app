namespace WarehouseApi.Dto;

// Racks in one zone, grouped by occupancy status (all/empty/full/partial)
// instead of a per-rack list the client would have to group itself.
public class RackOccupancyDto
{
    public List<RackSummaryDto> FullRacks { get; set; } = new List<RackSummaryDto>();
    public List<RackSummaryDto> EmptyRacks { get; set; } = new List<RackSummaryDto>();
    public List<RackSummaryDto> PartialRacks { get; set; } = new List<RackSummaryDto>();
}
