using WarehouseApi.Models;
using MongoDB.Driver;
using System.Security.Claims;

namespace WarehouseApi.Services;

public class UserService : IUserService
{
    private readonly IMongoCollection<User> _collection;
    private readonly IRoleService _roleService;

    public UserService(IMongoDatabase db, IRoleService roleService)
    {
        _collection = db.GetCollection<User>("users");
        _roleService = roleService;
    }

    public async Task<User?> GetByEmailAsync(string email)
    {
        return await _collection.Find(u => u.Email == email).FirstOrDefaultAsync();
    }

    public async Task CreateAsync(User user)
    {
        await _collection.InsertOneAsync(user);
    }

    public async Task<User?> GetByIdAsync(string id)
    {
        return await _collection.Find(u => u.Id == id).FirstOrDefaultAsync();
    }

    // Chain: JWT claims -> user id -> User document -> RoleId -> Role
    // document -> flattened "Entity:Permission" strings. Returns null at
    // any broken link (missing claim, deleted user, deleted role) instead
    // of throwing, so the caller can just treat null as "no access".
    public async Task<HashSet<string>?> GetPermissionsAsync(ClaimsPrincipal claimsUser)
    {
        var userId = claimsUser.FindFirstValue(ClaimTypes.NameIdentifier);
        if (userId == null)
        {
            return null;
        }

        var user = await GetByIdAsync(userId);
        if (user == null)
        {
            return null;
        }

        var role = await _roleService.GetByIdAsync(user.RoleId);
        if (role == null)
        {
            return null;
        }

        // Expand each entity's 4 boolean CRUD flags into "Entity:Verb"
        // strings (e.g. "Package:Read") - the flat format the frontend
        // actually checks against.
        var permissions = new HashSet<string>();
        foreach (var (entity, permSet) in role.Permissions)
        {
            if (permSet.CanRead) permissions.Add($"{entity}:Read");
            if (permSet.CanCreate) permissions.Add($"{entity}:Create");
            if (permSet.CanUpdate) permissions.Add($"{entity}:Update");
            if (permSet.CanDelete) permissions.Add($"{entity}:Delete");
        }

        return permissions;
    }
}