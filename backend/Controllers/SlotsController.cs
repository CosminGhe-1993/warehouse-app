using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using WarehouseApi.Attributes;
using WarehouseApi.Models;
using WarehouseApi.Services;
using WarehouseApi.Enums;
using WarehouseApi.Dto;
using WarehouseApi.Hubs;
using System.Security.Claims;

namespace WarehouseApi.Controllers;

// CRUD plus the slot-specific operations (merge, manual status/capacity
// override). Every mutating action broadcasts "WarehouseChanged" over
// SignalR afterwards, which is what makes other connected clients refresh
// live instead of needing a manual page reload.
[ApiController]
[Authorize]
[Route("api/slots")]
public class SlotsController : ControllerBase
{
    private readonly ISlotService _slotService;
    private readonly IPackageService _packageService;
    private readonly IUserService _userService;
    private readonly IHubContext<WarehouseHub> _hubContext;
    // Fallback capacity used when a slot's own MaxPackages is 0 ("not set").
    private const int MaxPackagesPerSlot = 4;

    public SlotsController(ISlotService slotService, IPackageService packageService, IUserService userService, IHubContext<WarehouseHub> hubContext)
    {
        _slotService = slotService;
        _packageService = packageService;
        _userService = userService;
        _hubContext = hubContext;
    }

    [HttpGet]
    [RequirePermission("Slot", "Read")]
    public async Task<ActionResult<List<Slot>>> GetAllAsync()
    {
        var slots = await _slotService.GetAllAsync();
        if(slots == null || slots.Count == 0)
        {
            return NotFound();
        }
        return Ok(slots);
    }

    // Main endpoint the rack view uses - returns slots with Status already
    // resolved server-side (see ComputeStatus below), so the frontend
    // doesn't need to know the manual-override/capacity rules itself.
    [HttpGet("by-rack/{rackId}")]
    [RequirePermission("Slot", "Read")]
    public async Task<ActionResult<List<SlotWithStatusDto>>> GetByRackIdAsync(string rackId)
    {
        var slots = await _slotService.GetByRackIdAsync(rackId);
        if(slots == null || slots.Count == 0)
        {
            return NotFound();
        }

        var result = new List<SlotWithStatusDto>();
        foreach (var slot in slots)
        {
            var packages = await _packageService.GetBySlotIdAsync(slot.Id);

            result.Add(new SlotWithStatusDto
            {
                Id = slot.Id,
                RackId = slot.RackId,
                Level = slot.Level,
                Code = slot.Code,
                Face = slot.Face,
                Status = ComputeStatus(packages.Count, slot),
                MergedFrom = slot.MergedFrom
            });
        }

        return Ok(result);
    }

    [HttpGet("{id}")]
    [RequirePermission("Slot", "Read")]
    public async Task<ActionResult<Slot>> GetByIdAsync(string id)
    {
        var slot = await _slotService.GetByIdAsync(id);
        if(slot == null)
        {
            return NotFound();
        }
        return Ok(slot);
    }

    [HttpPost]
    [RequirePermission("Slot", "Create")]
    public async Task<ActionResult<Slot>> Create([FromBody] Slot slot)
    {
        await _slotService.CreateAsync(slot);
        await _hubContext.Clients.All.SendAsync("WarehouseChanged");
        return Ok(slot);
    }

    [HttpPut("{id}")]
    [RequirePermission("Slot", "Update")]
    public async Task<ActionResult> Update(string id, [FromBody] Slot slot)
    {
        var existing = await _slotService.GetByIdAsync(id);
        if (existing == null)
        {
            return NotFound();
        }
        slot.Id = id;
        await _slotService.UpdateAsync(slot);
        await _hubContext.Clients.All.SendAsync("WarehouseChanged");
        return NoContent();
    }

    [HttpDelete("{id}")]
    [RequirePermission("Slot", "Delete")]
    public async Task<ActionResult> Delete(string id)
    {
        var existing = await _slotService.GetByIdAsync(id);
        if (existing == null)
        {
            return NotFound();
        }
        await _slotService.DeleteAsync(id);
        await _hubContext.Clients.All.SendAsync("WarehouseChanged");
        return NoContent();
    }

    // Combines 2+ selected slots into one - the current user/id is recorded
    // on the merge (see SlotService.MergeSlotsAsync) for the activity log.
    [HttpPost("merge")]
    [RequirePermission("Slot", "Update")]
    public async Task<ActionResult<Slot>> Merge([FromBody] MergeSlotsRequestDto request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = await _userService.GetByIdAsync(userId);
        var result = await _slotService.MergeSlotsAsync(request.SlotIds, userId, user?.Name ?? string.Empty);
        await _hubContext.Clients.All.SendAsync("WarehouseChanged");
        return Ok(result);
    }

    // Operator override - see ComputeStatus for how this interacts with
    // the automatic calculation.
    [HttpPut("{id}/status")]
    [RequirePermission("Slot", "Update")]
    public async Task<ActionResult> UpdateManualStatus(string id, [FromBody] SlotStatus newStatus)
    {
        var existing = await _slotService.GetByIdAsync(id);
        if (existing == null)
        {
            return NotFound();
        }

        existing.ManualStatus = newStatus;
        await _slotService.UpdateAsync(existing);
        await _hubContext.Clients.All.SendAsync("WarehouseChanged");
        return NoContent();
    }

    [HttpPut("{id}/capacity")]
    [RequirePermission("Slot", "Update")]
    public async Task<ActionResult> UpdateMaxPackages(string id, [FromBody] int newMaxPackages)
    {
        var existing = await _slotService.GetByIdAsync(id);
        if (existing == null)
        {
            return NotFound();
        }
        existing.MaxPackages = newMaxPackages;
        await _slotService.UpdateAsync(existing);
        await _hubContext.Clients.All.SendAsync("WarehouseChanged");
        return NoContent();
    }

    // Resolves a slot's displayed status from package count + overrides:
    // 0 packages is always Free no matter what (a manual override never
    // makes an empty slot look occupied); otherwise a manual override
    // other than Free always wins; otherwise it's calculated from count
    // vs. capacity (the slot's own MaxPackages, or the shared default).
    private static SlotStatus ComputeStatus(int count, Slot slot)
    {
        if (count == 0)
        {
            return SlotStatus.Free;
        }

        if (slot.ManualStatus != SlotStatus.Free)
        {
            return slot.ManualStatus;
        }

        if (count >= (slot.MaxPackages != 0 ? slot.MaxPackages : MaxPackagesPerSlot))
        {
            return SlotStatus.Full;
        }
        return SlotStatus.PartiallyOccupied;
    }
}
