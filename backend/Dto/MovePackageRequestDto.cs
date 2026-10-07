namespace WarehouseApi.Dto;

// Body of the package-move endpoint - which slot a package is leaving
// and which slot it's going into.
public class MovePackageRequestDto
{
    public string OriginSlotId { get; set; } = string.Empty;
    public string DestSlotId { get; set; } = string.Empty;
}
