namespace WarehouseApi.Dto;

// Body of the "move package into a rack's local buffer" endpoint.
public class MoveToBufferRequestDto
{
    public string RackId { get; set; } = string.Empty;
}
