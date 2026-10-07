using WarehouseApi.Models;
using MongoDB.Driver;

namespace WarehouseApi.Services;

// Thin wrapper over the "roles" collection - read by both AuthController
// (to load a user's role at login) and RequirePermissionAttribute
// (to check permissions on every gated request).
public class RoleService : IRoleService
{
    private readonly IMongoCollection<Role> _collection;

    public RoleService(IMongoDatabase db)
    {
        _collection = db.GetCollection<Role>("roles");
    }

    public async Task<List<Role>> GetAllAsync()
    {
        return await _collection.Find(_ => true).ToListAsync();
    }
    public async Task<Role?> GetByIdAsync(string id)
    {
        return await _collection.Find(r => r.Id == id).FirstOrDefaultAsync();
    }
    public async Task CreateAsync(Role role)
    {
        await _collection.InsertOneAsync(role);
    }
    public async Task UpdateAsync(Role role)
    {
        await _collection.ReplaceOneAsync(r => r.Id == role.Id, role);
    }
    public async Task DeleteAsync(string id)
    {
        await _collection.DeleteOneAsync(r => r.Id == id);
    }
}