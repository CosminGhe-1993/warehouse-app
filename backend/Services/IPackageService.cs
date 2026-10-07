using WarehouseApi.Models;

namespace WarehouseApi.Services;

public interface IPackageService
{
    // Excludes soft-deleted (IsRemoved) packages.
    Task<List<Package>> GetAllAsync();
    Task<Package?> GetByIdAsync(string id);
    // Case-insensitive partial match on recipient name.
    Task<List<Package>> GetByRecipientAsync(string recipient);
    Task CreateAsync(Package package);
    Task UpdateAsync(Package package);
    Task DeleteAsync(string id);
    // Appends one entry to a package's embedded move history.
    Task AddHistoryAsync(string packageId, PackageHistory history);
    Task<List<Package>> GetBySlotIdAsync(string slotId);
    Task<List<Package>> GetByRackBufferAsync(string rackId);
    Task<List<Package>> GetCentralBufferAsync();
    Task MoveToLocalBufferAsync(string packageId, string rackId);
    Task MovePackageAsync(string packageId, string originSlotId, string destSlotId);
    // Includes soft-deleted packages too - used for full audit/history views.
    Task<List<Package>> GetAllIncludingRemovedAsync();
}
