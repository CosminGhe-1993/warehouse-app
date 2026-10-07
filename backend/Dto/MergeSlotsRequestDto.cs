namespace WarehouseApi.Dto;

// Body of POST /api/slots/merge - the slots to combine into one. The
// survivor is the one with the lowest code; the rest get absorbed.
public class MergeSlotsRequestDto
{
    public List<string> SlotIds { get; set; } = new List<string>();
}
