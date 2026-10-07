namespace WarehouseApi.Dto;

// One tool call the AI assistant decided to make, translated from Groq's
// JSON response. Action names which tool (e.g. "rack_occupancy"); the
// other fields are that tool's extracted parameters - only the ones
// relevant to Action get filled in, the rest stay empty.
public class AssistantResponseDto
{
    public string Action { get; set; } = string.Empty;
    // Only set for the "unknown" action (model replied in plain text
    // instead of calling a tool).
    public string Message { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string Date { get; set; } = string.Empty;
    public string Recipient { get; set; } = string.Empty;
    public string ZoneName { get; set; } = string.Empty;
}