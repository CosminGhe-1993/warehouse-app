namespace WarehouseApi.Dto;

// A package plus its human-readable location name (e.g. "Raft 3"), so
// the frontend doesn't need a second lookup just to display where it is.
public class PackageWithLocationDto
{
    public string Id { get; set; } = string.Empty;
    public string Recipient { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string LocationName { get; set; } = string.Empty;
}
