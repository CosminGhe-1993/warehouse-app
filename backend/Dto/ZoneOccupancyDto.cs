namespace WarehouseApi.Dto;

// One zone's racks, grouped by occupancy status - the per-zone building
// block of the warehouse-wide occupancy view.
public class ZoneOccupancyDto
{
    public string ZoneName { get; set; } = string.Empty;
    public List<string> FullRackNames { get; set; } = new List<string>();
    public List<string> EmptyRackNames { get; set; } = new List<string>();
    public List<string> PartialRackNames { get; set; } = new List<string>();
}
