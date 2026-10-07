using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace WarehouseApi.Models;

// BsonIgnoreExtraElements: lets old documents in the database keep working
// even after new fields get added to this class later - MongoDB has no
// enforced schema, so extra/missing fields are the app's responsibility.
[BsonIgnoreExtraElements]
public class Rack
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;
    public string ZoneId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    // How many shelf levels this rack has; each level has its own slots.
    public int Levels { get; set; }
}