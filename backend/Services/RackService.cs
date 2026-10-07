using WarehouseApi.Models;
using MongoDB.Driver;

namespace WarehouseApi.Services;

// Thin wrapper over the "racks" collection.
public class RackService : IRackService
{
    private readonly IMongoCollection<Rack> _collection;

    public RackService(IMongoDatabase db)
    {
        _collection = db.GetCollection<Rack>("racks");
    }

    public async Task<List<Rack>> GetAllAsync()
    {
        return await _collection.Find(_ => true).ToListAsync();
    }

    // Used everywhere a zone's racks need listing (zone screen, occupancy
    // endpoints) - filters by the foreign key field, not a Mongo join.
    public async Task<List<Rack>> GetByZoneIdAsync(string zoneId)
    {
        return await _collection.Find(r => r.ZoneId == zoneId).ToListAsync();
    }

    public async Task<Rack?> GetByIdAsync(string id)
    {
        return await _collection.Find(r => r.Id == id).FirstOrDefaultAsync();
    }

    public async Task CreateAsync(Rack rack)
    {
        await _collection.InsertOneAsync(rack);
    }

    public async Task UpdateAsync(Rack rack)
    {
        await _collection.ReplaceOneAsync(r => r.Id == rack.Id, rack);
    }

    public async Task DeleteAsync(string id)
    {
        await _collection.DeleteOneAsync(r => r.Id == id);
    }
}