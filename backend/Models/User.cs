using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace WarehouseApi.Models;

// A login account. Permissions come from the Role it points to (RoleId),
// not from anything stored directly on the user.
public class User
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    // Hashed password, never the raw value.
    public string PasswordHash { get; set; } = string.Empty;
    public string RoleId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}