using WarehouseApi.Models;

namespace WarehouseApi.Services;

public interface ISlotService
{
    Task<List<Slot>> GetAllAsync();
    Task<List<Slot>> GetByRackIdAsync(string rackId);
    Task<Slot?> GetByIdAsync(string id);
    Task CreateAsync(Slot slot);
    Task UpdateAsync(Slot slot);
    Task DeleteAsync(string id);
    // Combines 2+ slots into one survivor slot; the rest are deleted.
    Task<Slot> MergeSlotsAsync(List<string> slotIds, string userId, string userName);
    // Reverses a merge back into its original individual slots, but only
    // if the merged slot currently holds no packages.
    Task SplitIfEmptyAsync(string slotId);
}
