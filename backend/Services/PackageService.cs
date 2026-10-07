using WarehouseApi.Models;
using MongoDB.Driver;
using WarehouseApi.Enums;

namespace WarehouseApi.Services;

// Deletes here are soft (IsRemoved = true, see Delete below is absent -
// removal is handled by the controller setting IsRemoved and calling
// UpdateAsync) so package history survives for audit/reporting even after
// a package is "removed" from the warehouse.
public class PackageService : IPackageService
{
    private readonly IMongoCollection<Package> _collection;

    public PackageService(IMongoDatabase db)
    {
        _collection = db.GetCollection<Package>("packages");
    }

    public async Task<List<Package>> GetAllAsync()
    {
        return await _collection.Find(p => !p.IsRemoved).ToListAsync();
    }

    public async Task<List<Package>> GetAllIncludingRemovedAsync()
    {
        return await _collection.Find(_ => true).ToListAsync();
    }
    public async Task<Package?> GetByIdAsync(string id)
    {
        return await _collection.Find(p => p.Id == id).FirstOrDefaultAsync();
    }
    // Regex search (case-insensitive, "i" option) instead of exact match,
    // so a partial name still finds the package.
    public async Task<List<Package>> GetByRecipientAsync(string recipient)
    {
        var filter = Builders<Package>.Filter.Regex(p => p.Recipient, new MongoDB.Bson.BsonRegularExpression(recipient, "i"));
        var notRemovedFilter = Builders<Package>.Filter.Eq(p => p.IsRemoved, false);
        var combinedFilter = Builders<Package>.Filter.And(filter, notRemovedFilter);

        return await _collection.Find(combinedFilter).ToListAsync();
    }

    public async Task CreateAsync(Package package)
    {
        await _collection.InsertOneAsync(package);
    }
    public async Task UpdateAsync(Package package)
    {
        await _collection.ReplaceOneAsync(p => p.Id == package.Id, package);
    }
    public async Task DeleteAsync(string id)
    {
        await _collection.DeleteOneAsync(p => p.Id == id);
    }
    // Push onto the embedded History array - a targeted update instead of
    // fetching and re-saving the whole document.
    public async Task AddHistoryAsync(string packageId, PackageHistory history)
    {
        var filter = Builders<Package>.Filter.Eq(p => p.Id, packageId);
        var update = Builders<Package>.Update.Push(p => p.History, history);
        await _collection.UpdateOneAsync(filter, update);
    }

    // AnyEq: matches if slotId appears anywhere in the package's SlotIds
    // array (a package can span multiple adjacent slots).
    public async Task<List<Package>> GetBySlotIdAsync(string slotId)
    {
        var filter = Builders<Package>.Filter.AnyEq(p => p.SlotIds, slotId);
        var notRemovedFilter = Builders<Package>.Filter.Eq(p => p.IsRemoved, false);
        var combinedFilter = Builders<Package>.Filter.And(filter, notRemovedFilter);
        return await _collection.Find(combinedFilter).ToListAsync();
    }

    public async Task<List<Package>> GetByRackBufferAsync(string rackId)
    {
        var filter = Builders<Package>.Filter.Eq(p => p.CurrentLocationId, rackId)
            & Builders<Package>.Filter.Eq(p => p.LocationType, LocationType.LocalBuffer)
            & Builders<Package>.Filter.Eq(p => p.IsRemoved, false);
        return await _collection.Find(filter).ToListAsync();
    }

    public async Task<List<Package>> GetCentralBufferAsync()
    {
        var filter = Builders<Package>.Filter.Eq(p => p.LocationType, LocationType.CentralBuffer)
            & Builders<Package>.Filter.Eq(p => p.IsRemoved, false);
        return await _collection.Find(filter).ToListAsync();
    }

    // Moves a package out of any slot and into a rack's local buffer -
    // clears SlotIds since it no longer occupies a specific slot.
    public async Task MoveToLocalBufferAsync(string packageId, string rackId)
    {
        var package = await GetByIdAsync(packageId);
        if (package == null)
        {
            throw new Exception("Package not found");
        }

        package.CurrentLocationId = rackId;
        package.LocationType = LocationType.LocalBuffer;
        package.SlotIds = new List<string>();

        await UpdateAsync(package);
    }

    // Moves a package from one slot to another - swaps the slot id in
    // SlotIds and updates CurrentLocationId to match.
    public async Task MovePackageAsync(string packageId, string originSlotId, string destSlotId)
    {
        var package = await GetByIdAsync(packageId);
        if (package == null)
        {
            throw new Exception("Package not found");
        }

        package.SlotIds.Remove(originSlotId);
        package.SlotIds.Add(destSlotId);
        package.CurrentLocationId = destSlotId;
        package.LocationType = LocationType.Slot;

        await UpdateAsync(package);
    }
}
