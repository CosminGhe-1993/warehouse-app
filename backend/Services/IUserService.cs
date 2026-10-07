using WarehouseApi.Models;
using System.Security.Claims;

namespace WarehouseApi.Services;

public interface IUserService
{
    Task<User?> GetByEmailAsync(string email);
    Task CreateAsync(User user);
    Task<User?> GetByIdAsync(string id);
    // Resolves the logged-in user (from the JWT claims) all the way down
    // to their flattened "Entity:Permission" string set, for the frontend.
    Task<HashSet<string>?> GetPermissionsAsync(ClaimsPrincipal claimsUser);
}