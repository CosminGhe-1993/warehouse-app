namespace WarehouseApi.Dto;

// One turn of assistant chat history ("user"/"assistant" + text), sent
// back on every request since the AI API itself is stateless.
public class ChatMessageDto
{
    public string Role { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
}
