using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using WarehouseApi.Enums;

namespace WarehouseApi.Models;

[BsonIgnoreExtraElements]
public class Slot
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;
    public string RackId { get; set; } = string.Empty;
    public int Level { get; set; }
    // Position within the level, e.g. "3" or the split halves "3A"/"3B".
    public string Code { get; set; } = string.Empty;
    // Each physical face (A/B) of a rack is its own separate Slot document,
    // not a field shared by one slot - so a rack level normally has 2 Slot
    // rows per code, one per face.
    public char Face { get; set; } = 'A';
    public List<string> PackageIds { get; set; } = new List<string>();
    // When 2+ slots get merged into one, the survivor (lowest code) keeps
    // this list of what it absorbed; the absorbed slots are deleted.
    public List<MergedSlotRef> MergedFrom { get; set; } = new List<MergedSlotRef>();
    // 0 means "not set, use the default capacity" - NOT zero capacity.
    public int MaxPackages { get; set; } = 0;
    // Operator override for status. Always wins over the automatic
    // calculation from PackageIds.Count, EXCEPT: when there are 0 packages
    // the slot is always Free regardless of this value, and Free itself as
    // a manual choice has no effect (treated as "not set").
    public SlotStatus ManualStatus { get; set; } = SlotStatus.Free;
}
