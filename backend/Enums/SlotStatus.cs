namespace WarehouseApi.Enums;

// Occupancy state of a slot. Can be set automatically from package count,
// or overridden manually by an operator (see Slot.ManualStatus).
public enum SlotStatus
{
    Free,
    PartiallyOccupied,
    Full
}