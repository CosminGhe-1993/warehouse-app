using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using WarehouseApi.Enums;

namespace WarehouseApi.Models;

[BsonIgnoreExtraElements]
public class Package
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;
    public string Recipient { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    // Id of whatever it currently sits in/on - meaning depends on
    // LocationType (a Slot id, or a Rack id when it's in a local buffer).
    public string CurrentLocationId { get; set; } = string.Empty;
    // Slots occupied by this package - can be more than one when a package
    // spans adjacent slots.
    public List<string> SlotIds { get; set; } = new List<string>();
    // Full move history (who moved it, from where, to where, when).
    public List<PackageHistory> History { get; set; } = new List<PackageHistory>();
    public DateTime EnteredAt { get; set; } = DateTime.UtcNow;
    public LocationType LocationType { get; set; } = LocationType.Slot;
    // Soft delete flag - removed packages are kept for history/audit
    // instead of actually deleting the document.
    public bool IsRemoved { get; set; } = false;
    // How many days this package can sit in a buffer before it's flagged
    // as an alert (0 = no limit configured).
    public int MaxBufferDays { get; set; } = 0;
}
