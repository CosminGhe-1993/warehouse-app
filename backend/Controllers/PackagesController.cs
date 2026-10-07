using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using WarehouseApi.Attributes;
using WarehouseApi.Dto;
using WarehouseApi.Models;
using WarehouseApi.Services;
using WarehouseApi.Enums;
using WarehouseApi.Hubs;
using System.Security.Claims;


namespace WarehouseApi.Controllers;

// The biggest controller - CRUD plus every package movement operation
// (buffer moves, slot-to-slot moves, alerts, zone/rack lookups). Every
// mutation both appends a PackageHistory entry (audit trail) and
// broadcasts "WarehouseChanged" over SignalR.
[ApiController]
[Authorize]
[Route("api/packages")]
public class PackagesController : ControllerBase
{
    private readonly IPackageService _packageService;
    private readonly ISlotService _slotService;
    private readonly IUserService _userService;
    private readonly IRackService _rackService;
    private readonly IZoneService _zoneService;
    private readonly IHubContext<WarehouseHub> _hubContext;
    public PackagesController(IPackageService packageService, ISlotService slotService, IUserService userService, IRackService rackService, IZoneService zoneService, IHubContext<WarehouseHub> hubContext)
    {
        _packageService = packageService;
        _slotService = slotService;
        _userService = userService;
        _rackService = rackService;
        _zoneService = zoneService;
        _hubContext = hubContext;
    }

    [HttpGet]
    [RequirePermission("Package", "Read")]
    public async Task<ActionResult<List<Package>>> GetAllAsync()
    {
        var packages = await _packageService.GetAllAsync();
        if(packages == null || packages.Count == 0)
        {
            return NotFound();
        }
        return Ok(packages);
    }

    [HttpGet("{id}")]
    [RequirePermission("Package", "Read")]
    public async Task<ActionResult<Package>> GetByIdAsync(string id)
    {
        var package = await _packageService.GetByIdAsync(id);
        if(package == null)
        {
            return NotFound();
        }
        return Ok(package);
    }

    [HttpGet("by-recipient/{recipient}")]
    [RequirePermission("Package", "Read")]
    public async Task<ActionResult<List<Package>>> GetByRecipientAsync(string recipient)
    {
        var packages = await _packageService.GetByRecipientAsync(recipient);
        if(packages == null || packages.Count == 0)
        {
            return NotFound();
        }
        return Ok(packages);
    }

    [HttpPost]
    [RequirePermission("Package", "Create")]
    public async Task<ActionResult<Package>> Create([FromBody] Package package)
    {
        // Business rule cap, enforced here rather than in the model itself.
        if (package.MaxBufferDays > 30)
        {
            return BadRequest("Perioada in tampon nu poate depasi 30 de zile.");
        }

        await _packageService.CreateAsync(package);
        // The first history entry only has a "to" location (there's no
        // "from" yet - this is where the package enters the warehouse).
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = await _userService.GetByIdAsync(userId);
        var history = new PackageHistory
        {
            Timestamp = DateTime.UtcNow,
            UserId = userId,
            UserName = user?.Name ?? string.Empty,
            ToLocationId = package.CurrentLocationId,
            ToLocationType = package.LocationType,
        };
        await _packageService.AddHistoryAsync(package.Id, history);
        await _hubContext.Clients.All.SendAsync("WarehouseChanged");

        return Ok(package);
    }

    [HttpPut("{id}")]
    [RequirePermission("Package", "Update")]
    public async Task<ActionResult> Update(string id, [FromBody] Package package)
    {
        var existing = await _packageService.GetByIdAsync(id);
        if(existing == null)
        {
            return NotFound();
        }
        package.Id = id;
        await _packageService.UpdateAsync(package);
        await _hubContext.Clients.All.SendAsync("WarehouseChanged");
        return NoContent();
    }

    // Soft delete: marks IsRemoved instead of actually removing the
    // document, so its history survives for audit/reporting. Then tries
    // to split any slot it occupied back apart, in case that slot was a
    // merge result that's now empty.
    [HttpDelete("{id}")]
    [RequirePermission("Package", "Delete")]
    public async Task<ActionResult> Delete(string id)
    {
        var existing = await _packageService.GetByIdAsync(id);
        if (existing == null)
        {
            return NotFound();
        }
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = await _userService.GetByIdAsync(userId);
        var history = new PackageHistory
        {
            UserId = userId,
            UserName = user?.Name ?? string.Empty,
            FromLocationId = existing.CurrentLocationId,
            FromLocationType = existing.LocationType,
        };
        existing.IsRemoved = true;
        await _packageService.UpdateAsync(existing);
        await _packageService.AddHistoryAsync(id, history);

        foreach (var slot in existing.SlotIds)
        {
            await _slotService.SplitIfEmptyAsync(slot);
        }
        await _hubContext.Clients.All.SendAsync("WarehouseChanged");
        return NoContent();
    }

    [HttpPost("{id}/history")]
    [RequirePermission("Package", "Update")]
    public async Task<ActionResult> AddHistory(string id, [FromBody] PackageHistory history)
    {
        var existing = await _packageService.GetByIdAsync(id);
        if (existing == null)
        {
            return NotFound();
        }
        await _packageService.AddHistoryAsync(id, history);
        await _hubContext.Clients.All.SendAsync("WarehouseChanged");
        return NoContent();
    }

    // Same "days in location vs. zone threshold" rule as the dashboard's
    // alert count, but here returning the actual package list with full
    // detail (recipient, zone/rack names) instead of just a number.
    [HttpGet("alerts")]
    [RequirePermission("Package", "Read")]
    public async Task<ActionResult<List<PackageAlertDto>>> GetAlertsAsync()
    {
        var packages = await _packageService.GetAllAsync();
        // Central buffer excluded - no zone to compare a threshold against.
        var candidates = packages.Where(p => p.LocationType == LocationType.Slot || p.LocationType == LocationType.LocalBuffer).ToList();

        var racks = await _rackService.GetAllAsync();
        var rackById = racks.ToDictionary(r => r.Id);

        var slots = await _slotService.GetAllAsync();
        var slotById = slots.ToDictionary(s => s.Id);

        var zones = await _zoneService.GetAllAsync();
        var zoneById = zones.ToDictionary(z => z.Id);

        var alerts = new List<PackageAlertDto>();
        foreach (var pkg in candidates)
        {
            string? rackId = null;
            if (pkg.LocationType == LocationType.LocalBuffer)
            {
                rackId = pkg.CurrentLocationId;
            }
            else if (slotById.TryGetValue(pkg.CurrentLocationId, out var slot))
            {
                rackId = slot.RackId;
            }

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
                alerts.Add(new PackageAlertDto
                {
                    PackageId = pkg.Id,
                    Recipient = pkg.Recipient,
                    Description = pkg.Description,
                    ZoneName = zone.Name,
                    RackName = rack.Name,
                    DaysInLocation = daysInLocation,
                    ThresholdDays = zone.AlertThresholdDays
                });
            }
        }

        if (alerts.Count == 0)
        {
            return NotFound();
        }
        return Ok(alerts);
    }

    [HttpGet("central-buffer")]
    [RequirePermission("Package", "Read")]
    public async Task<ActionResult<List<Package>>> GetCentralBufferAsync()
    {
        var packages = await _packageService.GetCentralBufferAsync();
        if (packages == null || packages.Count == 0)
        {
            return NotFound();
        }
        return Ok(packages);
    }

    [HttpPost("move-to-buffer/{packageId}")]
    [RequirePermission("Package", "Update")]
    public async Task<ActionResult> MoveToLocalBuffer(string packageId, [FromBody] MoveToBufferRequestDto request)
    {
        var existing = await _packageService.GetByIdAsync(packageId);
        if (existing == null)
        {
            return NotFound();
        }

        // Captured before the move so the history entry can record where
        // it came FROM, not the already-updated location.
        var fromLocationType = existing.LocationType;
        var fromLocationId = existing.CurrentLocationId;

        await _packageService.MoveToLocalBufferAsync(packageId, request.RackId);

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = await _userService.GetByIdAsync(userId);
        var history = new PackageHistory
        {
            UserId = userId,
            UserName = user?.Name ?? string.Empty,
            FromLocationId = fromLocationId,
            FromLocationType = fromLocationType,
            ToLocationId = request.RackId,
            ToLocationType = WarehouseApi.Enums.LocationType.LocalBuffer,
        };
        await _packageService.AddHistoryAsync(packageId, history);
        await _hubContext.Clients.All.SendAsync("WarehouseChanged");

        return NoContent();
    }

    [HttpGet("by-rack-buffer/{rackId}")]
    [RequirePermission("Package", "Read")]
    public async Task<ActionResult<List<Package>>> GetByRackBufferAsync(string rackId)
    {
        var packages = await _packageService.GetByRackBufferAsync(rackId);
        if (packages == null || packages.Count == 0)
        {
            return NotFound();
        }
        return Ok(packages);
    }

    // Backs the "list_zone_packages" assistant tool - every package
    // currently in a zone, with a ready-to-display location name, found
    // by walking zone -> its racks -> their slots -> packages in those
    // slots (or directly in a rack's local buffer).
    [HttpGet("by-zone/{zoneId}")]
    [RequirePermission("Package", "Read")]
    public async Task<ActionResult<List<PackageWithLocationDto>>> GetByZoneIdAsync(string zoneId)
    {
        var racks = await _rackService.GetByZoneIdAsync(zoneId);
        var rackById = racks.ToDictionary(r => r.Id);
        var rackIds = rackById.Keys.ToHashSet();

        // Maps slotId -> rackId for every slot belonging to a rack in this
        // zone, so a package's slot can be traced back to a rack name.
        var allSlots = await _slotService.GetAllAsync();
        var rackIdBySlotId = allSlots.Where(s => rackIds.Contains(s.RackId)).ToDictionary(s => s.Id, s => s.RackId);

        var allPackages = await _packageService.GetAllAsync();
        var packages = allPackages.Where(p =>
            (p.LocationType == LocationType.Slot && rackIdBySlotId.ContainsKey(p.CurrentLocationId)) ||
            (p.LocationType == LocationType.LocalBuffer && rackIds.Contains(p.CurrentLocationId))
        ).Select(p =>
        {
            var rackId = p.LocationType == LocationType.LocalBuffer ? p.CurrentLocationId : rackIdBySlotId[p.CurrentLocationId];
            var rackName = rackById.TryGetValue(rackId, out var rack) ? rack.Name : "necunoscut";
            var locationName = p.LocationType == LocationType.LocalBuffer
                ? $"{rackName} (tampon local)"
                : rackName;

            return new PackageWithLocationDto
            {
                Id = p.Id,
                Recipient = p.Recipient,
                Description = p.Description,
                LocationName = locationName
            };
        }).ToList();

        if (packages.Count == 0)
        {
            return NotFound();
        }
        return Ok(packages);
    }

    [HttpGet("by-slot/{slotId}")]
    [RequirePermission("Package", "Read")]
    public async Task<ActionResult<List<Package>>> GetBySlotIdAsync(string slotId)
    {
        var packages = await _packageService.GetBySlotIdAsync(slotId);
        if (packages == null || packages.Count == 0)
        {
            return NotFound();
        }
        return Ok(packages);
    }

    // Slot-to-slot move. After moving, tries to split the origin slot
    // back apart in case it was a merge result left empty by this move.
    [HttpPost("move/{packageId}")]
    [RequirePermission("Package", "Update")]
    public async Task<ActionResult> MovePackage(string packageId, [FromBody] MovePackageRequestDto request)
    {
        await _packageService.MovePackageAsync(packageId, request.OriginSlotId, request.DestSlotId);
        if (!string.IsNullOrEmpty(request.OriginSlotId))
        {
            await _slotService.SplitIfEmptyAsync(request.OriginSlotId);
        }
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = await _userService.GetByIdAsync(userId);
        var history = new PackageHistory
        {
            UserId = userId,
            UserName = user?.Name ?? string.Empty,
            FromLocationId = request.OriginSlotId,
            FromLocationType = WarehouseApi.Enums.LocationType.Slot,
            ToLocationId = request.DestSlotId,
            ToLocationType = WarehouseApi.Enums.LocationType.Slot,
        };
        await _packageService.AddHistoryAsync(packageId, history);
        await _hubContext.Clients.All.SendAsync("WarehouseChanged");
        return NoContent();
    }
}
