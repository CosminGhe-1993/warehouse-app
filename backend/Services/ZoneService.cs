using WarehouseApi.Models;
using MongoDB.Driver;

namespace WarehouseApi.Services;

// Thin wrapper over the "zones" MongoDB collection - no business logic,
// just translates the interface's methods into driver calls.
public class ZoneService : IZoneService
{
    private readonly IMongoCollection<Zone> _collection;

    public ZoneService(IMongoDatabase db)
    {
        _collection = db.GetCollection<Zone>("zones");
    }

    // _ => true: no filter, return every document in the collection.
    public async Task<List<Zone>> GetAllAsync()
    {
        return await _collection.Find(_ => true).ToListAsync();
    }

    public async Task<Zone?> GetByIdAsync(string id)
    {
        return await _collection.Find(z => z.Id == id).FirstOrDefaultAsync();
    }

    public async Task CreateAsync(Zone zone)
    {
        await _collection.InsertOneAsync(zone);
    }

    // Full-document replace by matching Id - not a partial/field-level update.
    public async Task UpdateAsync(Zone zone)
    {
        await _collection.ReplaceOneAsync(z => z.Id == zone.Id, zone);
    }

    public async Task DeleteAsync(string id)
    {
        await _collection.DeleteOneAsync(z => z.Id == id);
    }

}