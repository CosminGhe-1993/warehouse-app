using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WarehouseApi.Attributes;
using WarehouseApi.Dto;
using WarehouseApi.Enums;
using WarehouseApi.Models;
using WarehouseApi.Services;

namespace WarehouseApi.Controllers;

// CRUD over racks, plus the two occupancy-summary endpoints used by the
// warehouse-wide view and the Groq assistant's occupancy tools.
[ApiController]
[Authorize]
[Route("api/racks")]
public class RacksController : ControllerBase
{
    private readonly IRackService _rackService;
    private readonly ISlotService _slotService;
    private readonly IPackageService _packageService;
    private readonly IZoneService _zoneService;
    private const int MaxPackagesPerSlot = 4;

    public RacksController(IRackService rackService, ISlotService slotService, IPackageService packageService, IZoneService zoneService)
    {
        _rackService = rackService;
        _slotService = slotService;
        _packageService = packageService;
        _zoneService = zoneService;
    }

    // A whole rack's status: same per-slot rules as SlotsController's
    // ComputeStatus (0 packages -> Free, else manual override wins, else
    // count vs capacity), then rolled up - Full only if every slot is
    // Full, Free only if every slot is Free, otherwise Partial.
    private static SlotStatus ComputeRackStatus(Rack rack, List<Slot> allSlots, List<Package> allPackages)
    {
        var rackSlots = allSlots.Where(s => s.RackId == rack.Id).ToList();
        var statuses = rackSlots.Select(slot =>
        {
            var count = allPackages.Count(p => p.SlotIds.Contains(slot.Id));
            if (count == 0)
            {
                return SlotStatus.Free;
            }
            if (slot.ManualStatus != SlotStatus.Free)
            {
                return slot.ManualStatus;
            }
            return count >= (slot.MaxPackages != 0 ? slot.MaxPackages : MaxPackagesPerSlot)
                ? SlotStatus.Full
                : SlotStatus.PartiallyOccupied;
        }).ToList();

        if (statuses.All(s => s == SlotStatus.Full))
        {
            return SlotStatus.Full;
        }
        if (statuses.All(s => s == SlotStatus.Free))
        {
            return SlotStatus.Free;
        }
        return SlotStatus.PartiallyOccupied;
    }

    // Warehouse-wide occupancy: every zone's racks grouped by status.
    // Backs the "warehouse_occupancy" assistant tool and the dashboard's
    // all-zones view.
    [HttpGet("occupancy")]
    [RequirePermission("Rack", "Read")]
    public async Task<ActionResult<List<ZoneOccupancyDto>>> GetOccupancyAllZonesAsync()
    {
        var zones = await _zoneService.GetAllAsync();
        var racks = await _rackService.GetAllAsync();
        var allSlots = await _slotService.GetAllAsync();
        var allPackages = await _packageService.GetAllAsync();

        var result = new List<ZoneOccupancyDto>();
        foreach (var zone in zones)
        {
            var zoneRacks = racks.Where(r => r.ZoneId == zone.Id).ToList();
            var summary = new ZoneOccupancyDto { ZoneName = zone.Name };

            foreach (var rack in zoneRacks)
            {
                var rackSlots = allSlots.Where(s => s.RackId == rack.Id).ToList();
                // A rack with no slots configured yet has nothing to report.
                if (rackSlots.Count == 0)
                {
                    continue;
                }

                var status = ComputeRackStatus(rack, allSlots, allPackages);
                if (status == SlotStatus.Full) summary.FullRackNames.Add(rack.Name);
                else if (status == SlotStatus.Free) summary.EmptyRackNames.Add(rack.Name);
                else summary.PartialRackNames.Add(rack.Name);
            }

            // Skip zones that ended up with nothing to report at all.
            if (summary.FullRackNames.Count + summary.EmptyRackNames.Count + summary.PartialRackNames.Count > 0)
            {
                result.Add(summary);
            }
        }

        if (result.Count == 0)
        {
            return NotFound();
        }
        return Ok(result);
    }

    [HttpGet]
    [RequirePermission("Rack", "Read")]
    public async Task<ActionResult<List<Rack>>> GetAllAsync()
    {
        var racks = await _rackService.GetAllAsync();
        if(racks == null || racks.Count == 0)
        {
            return NotFound();
        }
        return Ok(racks);
    }

    [HttpGet("by-zone/{zoneId}")]
    [RequirePermission("Rack", "Read")]
    public async Task<ActionResult<List<Rack>>> GetByZoneIdAsync(string zoneId)
    {
        var racks = await _rackService.GetByZoneIdAsync(zoneId);
        if(racks == null || racks.Count == 0)
        {
            return NotFound();
        }
        return Ok(racks);
    }

    // Same status logic as ComputeRackStatus, but scoped to one zone and
    // inlined rather than reusing it - backs the "rack_occupancy" assistant
    // tool (single-zone occupancy).
    [HttpGet("by-zone/{zoneId}/occupancy")]
    [RequirePermission("Rack", "Read")]
    public async Task<ActionResult<RackOccupancyDto>> GetOccupancyByZoneAsync(string zoneId)
    {
        var racks = await _rackService.GetByZoneIdAsync(zoneId);
        if (racks == null || racks.Count == 0)
        {
            return NotFound();
        }

        var allSlots = await _slotService.GetAllAsync();
        var allPackages = await _packageService.GetAllAsync();

        var result = new RackOccupancyDto();
        foreach (var rack in racks)
        {
            var rackSlots = allSlots.Where(s => s.RackId == rack.Id).ToList();
            if (rackSlots.Count == 0)
            {
                continue;
            }

            var statuses = rackSlots.Select(slot =>
            {
                var count = allPackages.Count(p => p.SlotIds.Contains(slot.Id));
                if (count == 0)
                {
                    return SlotStatus.Free;
                }
                if (slot.ManualStatus != SlotStatus.Free)
                {
                    return slot.ManualStatus;
                }
                return count >= (slot.MaxPackages != 0 ? slot.MaxPackages : MaxPackagesPerSlot)
                    ? SlotStatus.Full
                    : SlotStatus.PartiallyOccupied;
            }).ToList();

            var summary = new RackSummaryDto { Id = rack.Id, Name = rack.Name };
            if (statuses.All(s => s == SlotStatus.Full))
            {
                result.FullRacks.Add(summary);
            }
            else if (statuses.All(s => s == SlotStatus.Free))
            {
                result.EmptyRacks.Add(summary);
            }
            else
            {
                result.PartialRacks.Add(summary);
            }
        }

        return Ok(result);
    }

    [HttpGet("{id}")]
    [RequirePermission("Rack", "Read")]
    public async Task<ActionResult<Rack>> GetByIdAsync(string id)
    {
        var rack = await _rackService.GetByIdAsync(id);
        if(rack == null)
        {
            return NotFound();
        }
        return Ok(rack);
    }

    [HttpPost]
    [RequirePermission("Rack", "Create")]
    public async Task<ActionResult<Rack>> Create([FromBody] Rack rack)
    {
        await _rackService.CreateAsync(rack);
        return Ok(rack);
    }

    [HttpPut("{id}")]
    [RequirePermission("Rack", "Update")]
    public async Task<ActionResult> Update(string id, [FromBody] Rack rack)
    {
        var existing = await _rackService.GetByIdAsync(id);
        if (existing == null)
        {
            return NotFound();
        }
        rack.Id = id;
        await _rackService.UpdateAsync(rack);
        return NoContent();
    }

    [HttpDelete("{id}")]
    [RequirePermission("Rack", "Delete")]
    public async Task<ActionResult> Delete(string id)
    {
        var existing = await _rackService.GetByIdAsync(id);
        if (existing == null)
        {
            return NotFound();
        }
        await _rackService.DeleteAsync(id);
        return NoContent();
    }
}
