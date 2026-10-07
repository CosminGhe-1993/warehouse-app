using WarehouseApi.Enums;
using WarehouseApi.Models;

namespace WarehouseApi.Dto;

// Slot data sent to the frontend, with Status already resolved (manual
// override applied where relevant) instead of making the client redo
// that logic from PackageIds/ManualStatus itself.
public class SlotWithStatusDto
{
    public string Id { get; set; } = string.Empty;
    public string RackId { get; set; } = string.Empty;
    public int Level { get; set; }
    public string Code { get; set; } = string.Empty;
    public char Face { get; set; } = 'A';
    public SlotStatus Status { get; set; } = SlotStatus.Free;
    public List<MergedSlotRef> MergedFrom { get; set; } = new List<MergedSlotRef>();
}
