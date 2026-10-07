using WarehouseApi.Models;

namespace WarehouseApi.Services;

// Top-level CRUD for zones (the outermost level of the warehouse hierarchy).
public interface IZoneService
{
    Task<List<Zone>> GetAllAsync();
    Task<Zone?> GetByIdAsync(string id);
    Task CreateAsync(Zone zone);
    Task UpdateAsync(Zone zone);
    Task DeleteAsync(string id);
}