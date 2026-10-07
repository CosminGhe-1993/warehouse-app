namespace WarehouseApi.Dto;

// Aggregate action count for one operator, used in the dashboard's
// "activity by operator" breakdown.
public class OperatorActivityDto
{
    public string UserName { get; set; } = string.Empty;
    public int Count { get; set; }
}
