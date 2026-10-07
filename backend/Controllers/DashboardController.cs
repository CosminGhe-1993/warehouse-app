using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WarehouseApi.Attributes;
using WarehouseApi.Dto;
using WarehouseApi.Enums;
using WarehouseApi.Services;

namespace WarehouseApi.Controllers;

// Aggregates data from slots/packages/racks/zones into the dashboard's
// summary numbers and activity feed - nothing here is stored directly,
// it's all computed on read from the other collections.
[ApiController]
[Authorize]
[Route("api/dashboard")]
public class DashboardController : ControllerBase
{
    private readonly ISlotService _slotService;
    private readonly IPackageService _packageService;
    private readonly IRackService _rackService;
    private readonly IZoneService _zoneService;
    private const int MaxPackagesPerSlot = 4;

    public DashboardController(ISlotService slotService, IPackageService packageService, IRackService rackService, IZoneService zoneService)
    {
        _slotService = slotService;
        _packageService = packageService;
        _rackService = rackService;
        _zoneService = zoneService;
    }

    [HttpGet("stats")]
    [RequirePermission("Package", "Read")]
    public async Task<ActionResult<DashboardStatsDto>> GetStatsAsync()
    {
        var slots = await _slotService.GetAllAsync();
        var activePackages = await _packageService.GetAllAsync();

        // Tally every slot into Free/Partial/Full using the same status
        // rules as SlotsController.ComputeStatus (duplicated here rather
        // than shared, since this only needs the count not the full DTO).
        int freeSlots = 0, partialSlots = 0, fullSlots = 0;
        foreach (var slot in slots)
        {
            var count = activePackages.Count(p => p.SlotIds.Contains(slot.Id));
            SlotStatus status;
            if (count == 0)
            {
                status = SlotStatus.Free;
            }
            else if (slot.ManualStatus != SlotStatus.Free)
            {
                status = slot.ManualStatus;
            }
            else if (count >= (slot.MaxPackages != 0 ? slot.MaxPackages : MaxPackagesPerSlot))
            {
                status = SlotStatus.Full;
            }
            else
            {
                status = SlotStatus.PartiallyOccupied;
            }

            if (status == SlotStatus.Free) freeSlots++;
            else if (status == SlotStatus.PartiallyOccupied) partialSlots++;
            else fullSlots++;
        }

        var localBufferCount = activePackages.Count(p => p.LocationType == LocationType.LocalBuffer);
        var centralBufferCount = activePackages.Count(p => p.LocationType == LocationType.CentralBuffer);

        var racks = await _rackService.GetAllAsync();
        var rackById = racks.ToDictionary(r => r.Id);
        var slotById = slots.ToDictionary(s => s.Id);
        var zones = await _zoneService.GetAllAsync();
        var zoneById = zones.ToDictionary(z => z.Id);

        // A package is "alerting" once it's sat longer than its zone's
        // configured AlertThresholdDays. Central-buffer packages are
        // excluded (no zone to compare against), only Slot/LocalBuffer
        // ones can be traced back to a zone via their rack.
        var activeAlertsCount = 0;
        foreach (var pkg in activePackages.Where(p => p.LocationType == LocationType.Slot || p.LocationType == LocationType.LocalBuffer))
        {
            string? rackId = pkg.LocationType == LocationType.LocalBuffer
                ? pkg.CurrentLocationId
                : (slotById.TryGetValue(pkg.CurrentLocationId, out var slot) ? slot.RackId : null);

            if (rackId == null || !rackById.TryGetValue(rackId, out var rack))
            {
                continue;
            }
            if (!zoneById.TryGetValue(rack.ZoneId, out var zone) || zone.AlertThresholdDays <= 0)
            {
                continue;
            }

            var daysInLocation = (DateTime.UtcNow - pkg.EnteredAt).Days;
            if (daysInLocation > zone.AlertThresholdDays)
            {
                activeAlertsCount++;
            }
        }

        // Combined package-move + slot-merge timeline, reused below by
        // GetActivityAsync too so both endpoints stay consistent.
        var allActivity = await BuildAllActivityAsync();

        var recentActivity = allActivity.OrderByDescending(a => a.Timestamp).Take(10).ToList();
        var activityByOperator = allActivity
            .GroupBy(a => a.UserName)
            .Select(g => new OperatorActivityDto { UserName = g.Key, Count = g.Count() })
            .OrderByDescending(o => o.Count)
            .ToList();

        var result = new DashboardStatsDto
        {
            FreeSlots = freeSlots,
            PartialSlots = partialSlots,
            FullSlots = fullSlots,
            LocalBufferCount = localBufferCount,
            CentralBufferCount = centralBufferCount,
            ActiveAlertsCount = activeAlertsCount,
            RecentActivity = recentActivity,
            ActivityByOperator = activityByOperator
        };

        return Ok(result);
    }

    // Backs the "operator_activity" assistant tool and the stats page's
    // per-operator drill-down. userName is nullable/optional: empty means
    // "all operators" (the Contains check then matches everything).
    // userName must be declared string? here - a non-nullable [FromQuery]
    // string gets silently rejected by ASP.NET Core's implicit-required
    // model binding even when it's just an empty string, not just null.
    [HttpGet("activity")]
    [RequirePermission("Package", "Read")]
    public async Task<ActionResult<List<RecentActivityDto>>> GetActivityAsync([FromQuery] string? userName, [FromQuery] string date)
    {
        var allActivity = await BuildAllActivityAsync();

        var filtered = allActivity
            .Where(a => a.UserName.Contains(userName ?? "", StringComparison.OrdinalIgnoreCase)
                && a.Timestamp.ToString("yyyy-MM-dd") == date)
            .OrderByDescending(a => a.Timestamp)
            .ToList();

        if (filtered.Count == 0)
        {
            return NotFound();
        }
        return Ok(filtered);
    }

    // Builds one unified activity timeline out of two different sources:
    // every package's move History entries, plus every slot's MergedFrom
    // entries (a merge is also a kind of "activity" worth showing/filtering,
    // even though it isn't a Package event).
    private async Task<List<RecentActivityDto>> BuildAllActivityAsync()
    {
        var slots = await _slotService.GetAllAsync();
        var racks = await _rackService.GetAllAsync();
        var rackById = racks.ToDictionary(r => r.Id);
        var slotById = slots.ToDictionary(s => s.Id);

        // Turns a raw location id/type into a human-readable label for
        // display (e.g. "Slot 3A, nivel 1") instead of showing raw ids.
        string DescribeLocation(string locationId, LocationType locationType)
        {
            if (string.IsNullOrEmpty(locationId))
            {
                return string.Empty;
            }
            if (locationType == LocationType.Slot && slotById.TryGetValue(locationId, out var slot))
            {
                return $"Slot {slot.Code}{slot.Face}, nivel {slot.Level}";
            }
            if (locationType == LocationType.LocalBuffer && rackById.TryGetValue(locationId, out var rack))
            {
                return $"Tampon local {rack.Name}";
            }
            if (locationType == LocationType.CentralBuffer)
            {
                return "Tampon central";
            }
            return locationId;
        }

        // Includes removed packages too, so a package's move history
        // still shows up in the activity feed even after it's been
        // taken out of the warehouse.
        var allPackages = await _packageService.GetAllIncludingRemovedAsync();
        var allActivity = new List<RecentActivityDto>();
        foreach (var pkg in allPackages)
        {
            foreach (var h in pkg.History)
            {
                allActivity.Add(new RecentActivityDto
                {
                    PackageId = pkg.Id,
                    Recipient = pkg.Recipient,
                    Description = pkg.Description,
                    UserName = h.UserName,
                    Timestamp = h.Timestamp,
                    FromLocationId = h.FromLocationId,
                    FromLocationType = h.FromLocationType,
                    FromLocationName = DescribeLocation(h.FromLocationId, h.FromLocationType),
                    ToLocationId = h.ToLocationId,
                    ToLocationType = h.ToLocationType,
                    ToLocationName = DescribeLocation(h.ToLocationId, h.ToLocationType)
                });
            }
        }

        // Each MergedSlotRef becomes one activity entry: "from" the
        // absorbed slot's original identity, "to" the surviving slot.
        foreach (var slot in slots)
        {
            foreach (var mergedRef in slot.MergedFrom)
            {
                // Merge entries carried over from before this field existed
                // have no UserId recorded - skip those rather than show a
                // blank/misleading activity row.
                if (string.IsNullOrEmpty(mergedRef.UserId))
                {
                    continue;
                }

                allActivity.Add(new RecentActivityDto
                {
                    Recipient = "Unire sloturi",
                    UserName = mergedRef.UserName,
                    Timestamp = mergedRef.Timestamp,
                    FromLocationId = mergedRef.SlotId,
                    FromLocationType = LocationType.Slot,
                    FromLocationName = $"Slot {mergedRef.Code}{mergedRef.Face}, nivel {mergedRef.Level}",
                    ToLocationId = slot.Id,
                    ToLocationType = LocationType.Slot,
                    ToLocationName = DescribeLocation(slot.Id, LocationType.Slot)
                });
            }
        }

        return allActivity;
    }
}
