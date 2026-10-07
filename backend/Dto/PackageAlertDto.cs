namespace WarehouseApi.Dto;

// A package that has sat in its current location longer than the
// configured threshold (DaysInLocation > ThresholdDays).
public class PackageAlertDto
{
    public string PackageId { get; set; } = string.Empty;
    public string Recipient { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string ZoneName { get; set; } = string.Empty;
    public string RackName { get; set; } = string.Empty;
    public int DaysInLocation { get; set; }
    public int ThresholdDays { get; set; }
}
