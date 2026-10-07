using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace WarehouseApi.Models;

// A named set of CRUD permissions per entity type (e.g. "Package", "Slot").
// [RequirePermissionAttribute] reads this dictionary to decide whether a
// user's role is allowed to hit a given endpoint.
public class Role
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    // Key = entity name (matches what [RequirePermission] checks against).
    public Dictionary<string, PermissionSet> Permissions { get; set; } = new();
}

// The 4 CRUD flags a role can have for one entity type.
public class PermissionSet
{
    public bool CanRead { get; set; } = false;
    public bool CanCreate { get; set; } = false;
    public bool CanUpdate { get; set; } = false;
    public bool CanDelete { get; set; } = false;
}