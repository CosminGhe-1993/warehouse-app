using WarehouseApi.Models;

namespace WarehouseApi.Services;

// CRUD for racks - the level between Zone and Slot in the hierarchy.
public interface IRackService
{
    Task<List<Rack>> GetAllAsync();
    Task<List<Rack>> GetByZoneIdAsync(string zoneId);
    Task<Rack?> GetByIdAsync(string id);
    Task CreateAsync(Rack rack);
    Task UpdateAsync(Rack rack);
    Task DeleteAsync(string id);
}