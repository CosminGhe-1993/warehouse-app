namespace WarehouseApi.Dto;

// Body of POST /api/assistant/query - the new question plus the prior
// conversation turns, so the AI can resolve follow-ups like "which of
// them" against what was already discussed.
public class AssistantQueryRequestDto
{
    public string Query { get; set; } = string.Empty;
    public List<ChatMessageDto> History { get; set; } = new();
}