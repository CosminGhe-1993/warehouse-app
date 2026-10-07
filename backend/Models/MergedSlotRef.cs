namespace WarehouseApi.Models;

// Remembers one slot that got absorbed into another during a merge -
// its original identity (level/code/face) plus who merged it and when,
// so the merge can still be audited after the original Slot document
// is gone.
public class MergedSlotRef
{
    public string SlotId { get; set; } = string.Empty;
    public int Level { get; set; }
    public string Code { get; set; } = string.Empty;
    public char Face { get; set; } = 'A';
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
