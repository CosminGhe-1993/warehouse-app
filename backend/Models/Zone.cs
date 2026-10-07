using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace WarehouseApi.Models;

// Top level of the warehouse hierarchy: Zone -> Rack -> Slot.
public class Zone
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id{ get; set; } = string.Empty;
    public string Name{ get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    // How many days a package can sit in this zone before it's flagged
    // as an alert (0 = no threshold configured).
    public int AlertThresholdDays { get; set; } = 0;
}