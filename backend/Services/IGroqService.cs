using WarehouseApi.Dto;

namespace WarehouseApi.Services;

public interface IGroqService
{
    // Sends a natural-language query (plus prior conversation turns) to
    // the AI, and returns one AssistantResponseDto per tool it decided
    // to call - can be more than one if the question needs several.
    Task<List<AssistantResponseDto>> InterpretQueryAsync(string query, List<ChatMessageDto> history);
}