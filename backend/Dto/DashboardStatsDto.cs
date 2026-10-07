namespace WarehouseApi.Dto;

// Everything the dashboard's main stats view needs in one response -
// slot counts, buffer counts, alerts, and recent activity feeds.
public class DashboardStatsDto
{
    public int FreeSlots { get; set; }
    public int PartialSlots { get; set; }
    public int FullSlots { get; set; }
    public int LocalBufferCount { get; set; }
    public int CentralBufferCount { get; set; }
    public int ActiveAlertsCount { get; set; }
    public List<RecentActivityDto> RecentActivity { get; set; } = new List<RecentActivityDto>();
    public List<OperatorActivityDto> ActivityByOperator { get; set; } = new List<OperatorActivityDto>();
}
