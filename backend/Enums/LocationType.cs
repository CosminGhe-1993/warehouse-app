namespace WarehouseApi.Enums;

// Where a package currently sits. A package's CurrentLocationId points at
// either a Slot, a Rack (when in that rack's local buffer) or the warehouse
// itself (central buffer) depending on this value.
public enum LocationType
{
    Slot,
    LocalBuffer,
    CentralBuffer
}