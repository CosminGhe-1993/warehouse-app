using WarehouseApi.Models;

namespace WarehouseApi.Services;

// CRUD for roles - the dynamic permission sets an admin assigns to users.
public interface IRoleService
{
    Task<List<Role>> GetAllAsync();
    Task<Role?> GetByIdAsync(string id);
    Task CreateAsync(Role role);
    Task UpdateAsync(Role role);
    Task DeleteAsync(string id);
}