using WarehouseApi.Models;
using MongoDB.Driver;
using WarehouseApi.Enums;

namespace WarehouseApi.Services;

// Owns the merge/split lifecycle of slots, on top of plain CRUD. Depends
// on IPackageService (not the other way around) because SplitIfEmptyAsync
// needs to check whether a slot currently holds any packages.
public class SlotService : ISlotService
{
    private readonly IMongoCollection<Slot> _collection;
    private readonly IPackageService _packageService;

    public SlotService(IMongoDatabase db, IPackageService packageService)
    {
        _collection = db.GetCollection<Slot>("slots");
        _packageService = packageService;
    }

    public async Task<List<Slot>> GetAllAsync()
    {
        return await _collection.Find(_ => true).ToListAsync();
    }

    public async Task<List<Slot>> GetByRackIdAsync(string rackId)
    {
        return await _collection.Find(s => s.RackId == rackId).ToListAsync();
    }

    public async Task<Slot?> GetByIdAsync(string id)
    {
        return await _collection.Find(s => s.Id == id).FirstOrDefaultAsync();
    }

    public async Task CreateAsync(Slot slot)
    {
        await _collection.InsertOneAsync(slot);
    }

    public async Task UpdateAsync(Slot slot)
    {
        await _collection.ReplaceOneAsync(s => s.Id == slot.Id, slot);
    }

    public async Task DeleteAsync(string id)
    {
        await _collection.DeleteOneAsync(s => s.Id == id);
    }

    public async Task<Slot> MergeSlotsAsync(List<string> slotIds, string userId, string userName)
    {
        if (slotIds == null || slotIds.Count == 0)
        {
            throw new ArgumentException("Slot id list cannot be null or empty.");
        }

        // Dedupe the requested ids, then load the actual Slot documents -
        // fail fast if any referenced id doesn't exist.
        var distinctIds = slotIds.Distinct().ToList();
        var slots = new List<Slot>();
        foreach (var id in distinctIds)
        {
            var slot = await GetByIdAsync(id);
            if (slot == null)
            {
                throw new InvalidOperationException($"Slot with ID {id} not found.");
            }
            slots.Add(slot);
        }

        // The leftmost slot (lowest Code) is always the survivor, regardless of selection order,
        // so the merged cube consistently extends to the right on the frontend. If two slots share
        // the same Code, the lowest Level wins next (so a vertical merge consistently extends
        // upward), and if both Code and Level match, Face 'A' wins as the final tiebreak.
        var targetSlot = slots
            .OrderBy(s => int.Parse(s.Code))
            .ThenBy(s => s.Level)
            .ThenBy(s => s.Face)
            .First();
        var otherSlots = slots.Where(s => s.Id != targetSlot.Id).ToList();

        // Carry over each absorbed slot's own merge history too, so re-merging an
        // already-merged slot doesn't lose track of what it previously absorbed.
        // Only the fresh entry (this merge action) gets the current user/timestamp -
        // carried-over entries keep whoever originally merged them.
        var newlyAbsorbed = otherSlots.SelectMany(s =>
            new[] { new MergedSlotRef { SlotId = s.Id, Level = s.Level, Code = s.Code, Face = s.Face, UserId = userId, UserName = userName, Timestamp = DateTime.UtcNow } }.Concat(s.MergedFrom));

        // Merge the absorbed-slot references into the survivor's list,
        // skipping any SlotId already present (existingIds.Add returns
        // false for a duplicate) so re-merging never double-counts.
        var existingIds = targetSlot.MergedFrom.Select(m => m.SlotId).ToHashSet();
        var merged = targetSlot.MergedFrom.ToList();
        foreach (var reference in newlyAbsorbed)
        {
            if (existingIds.Add(reference.SlotId))
            {
                merged.Add(reference);
            }
        }
        targetSlot.MergedFrom = merged;
        await UpdateAsync(targetSlot);

        // Absorbed slots stop existing as their own documents - their
        // identity now only lives inside targetSlot.MergedFrom.
        foreach (var slot in otherSlots)
        {
            await DeleteAsync(slot.Id);
        }

        return targetSlot;
    }

    // Called after a package leaves a slot (see PackagesController.Delete/
    // Move) to check whether a previously-merged slot can now be split
    // back apart. Only actually splits when the slot both was a merge
    // result AND currently holds zero packages - a merged slot with any
    // package still in it stays merged.
    public async Task SplitIfEmptyAsync(string slotId)
    {
        var slot = await GetByIdAsync(slotId);

        if (slot == null)
        {
            return;
        }

        if(slot.MergedFrom.Count == 0)
        {
            return;
        }

        var existingPackages = await _packageService.GetBySlotIdAsync(slot.Id);
        if (existingPackages.Count > 0)
        {
            return;
        }
        else
        {
            // Recreate one fresh, empty Slot document per absorbed
            // reference, restoring its original level/code/face.
            foreach (var mergedRef in slot.MergedFrom)
            {
                var newSlot = new Slot
                {
                    RackId = slot.RackId,
                    Level = mergedRef.Level,
                    Code = mergedRef.Code,
                    Face = mergedRef.Face,
                    MaxPackages = 0,
                    ManualStatus = SlotStatus.Free
                };
                await CreateAsync(newSlot);
            }

            // The original slot goes back to its own unmerged, default state.
            slot.MergedFrom = new List<MergedSlotRef>();
            slot.ManualStatus = SlotStatus.Free;
            slot.MaxPackages = 0;
            await UpdateAsync(slot);
        }
    }
}
