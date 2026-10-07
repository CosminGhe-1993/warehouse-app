using System.Text;
using System.Text.Json;
using WarehouseApi.Dto;

namespace WarehouseApi.Services;

// Talks to Groq's API (OpenAI-compatible /chat/completions) using function
// calling: instead of returning free text, the model picks from a fixed
// menu of "tools" below and returns which one(s) to call plus their
// parameters as JSON. This class only decides WHAT to do - it doesn't
// execute anything itself; the controller/frontend do the actual work
// (querying MongoDB, navigating) based on what comes back.
public class GroqService : IGroqService
{
    private readonly HttpClient _httpClient;
    private readonly string _apiKey;

    public GroqService(HttpClient httpClient, IConfiguration configuration)
    {
        _httpClient = httpClient;
        _apiKey = configuration["Groq:ApiKey"]!;
    }

    public async Task<List<AssistantResponseDto>> InterpretQueryAsync(string query, List<ChatMessageDto> history)
    {
        // Conversation history is replayed on every call (system message +
        // each past turn + the new question) because the API itself is
        // stateless - it has no memory between requests unless we send it.
        var messages = new List<object>
        {
            new { role = "system", content = $"Today's date is {DateTime.UtcNow:yyyy-MM-dd}. Resolve relative dates (today, yesterday) against this. Always reply in the same language the user wrote in. Use the earlier messages in this conversation for context (e.g. 'those' or 'them' refers to what was just discussed). If fully answering the user's question needs information from more than one of the tools below (e.g. they ask both which racks are occupied AND what packages are inside them), call all of the relevant tools in this same response instead of picking just one." }
        };
        foreach (var pastMessage in history)
        {
            messages.Add(new { role = pastMessage.Role, content = pastMessage.Content });
        }
        messages.Add(new { role = "user", content = query });

        // Each tool's "description" is the actual instruction the model
        // reads to decide when to use it - tuning these strings (not
        // writing more code) is how ambiguous tool selection gets fixed.
        var requestBody = new
        {
            model = "openai/gpt-oss-20b",
            messages = messages,
            tools = new object[]
            {
                new
                {
                    type = "function",
                    function = new
                    {
                        name = "operator_activity",
                        description = "Gets the list of actions (package moves, slot merges) performed by warehouse operators on ONE SPECIFIC calendar date. Use this whenever the user asks what an operator did, or what happened in the warehouse, on a given day - if the user does not name one specific operator, leave userName empty to include all operators. Always requires a date; resolve relative dates (azi, ieri) before calling.",
                        parameters = new
                        {
                            type = "object",
                            properties = new
                            {
                                userName = new { type = "string", description = "The specific operator's full name, or an empty string if the user means all operators" },
                                date = new { type = "string", description = "Date in YYYY-MM-DD format" }
                            },
                            required = new[] { "date" }
                        }
                    }
                },
                new
                {
                    type = "function",
                    function = new
                    {
                        name = "find_package",
                        description = "Searches for a package anywhere in the warehouse by the exact or partial name of its recipient (the person it's addressed to). Use this when the user wants to locate a specific person's package by name. Do NOT use this when the user asks what's inside a zone (use list_zone_packages for that instead).",
                        parameters = new
                        {
                            type = "object",
                            properties = new
                            {
                                recipient = new { type = "string", description = "The package recipient's name" }
                            },
                            required = new[] { "recipient" }
                        }
                    }
                },
                new
                {
                    type = "function",
                    function = new
                    {
                        name = "navigate_zone",
                        description = "Switches the app's view to show a specific warehouse zone by name, with no extra information about occupancy or packages. Use ONLY when the user just wants to go look at / be shown a zone. If the user is also asking what's full/empty or what's inside it, use rack_occupancy or list_zone_packages instead - both of those already navigate there too.",
                        parameters = new
                        {
                            type = "object",
                            properties = new
                            {
                                zoneName = new { type = "string", description = "The zone's name" }
                            },
                            required = new[] { "zoneName" }
                        }
                    }
                },
                new
                {
                    type = "function",
                    function = new
                    {
                        name = "rack_occupancy",
                        description = "Shows which racks in ONE SPECIFIC zone are full, empty, or partially occupied - status/counts only, not the actual packages. ONLY use this when the user's message names a specific zone (e.g. 'Zona A'). If no zone is named in the message, use warehouse_occupancy instead - do NOT ask the user to name a zone. If the user also wants to know WHICH packages are there, call list_zone_packages as well in the same response.",
                        parameters = new
                        {
                            type = "object",
                            properties = new
                            {
                                zoneName = new { type = "string", description = "The zone's name" }
                            },
                            required = new[] { "zoneName" }
                        }
                    }
                },
                new
                {
                    type = "function",
                    function = new
                    {
                        name = "warehouse_occupancy",
                        description = "Shows which racks are full, empty, or partially occupied, across every zone in the warehouse - status/counts only, not the actual packages. This is the DEFAULT choice whenever the user asks which racks/zones have packages, are full, or are empty, and does NOT name one specific zone in their message. Prefer this over rack_occupancy unless a zone name is explicitly mentioned.",
                        parameters = new
                        {
                            type = "object",
                            properties = new { }
                        }
                    }
                },
                new
                {
                    type = "function",
                    function = new
                    {
                        name = "list_zone_packages",
                        description = "Lists the actual packages (recipient, description, exact rack location) currently stored in a specific zone. Use this when the user asks WHICH packages, or WHAT is in a zone - not just occupancy counts (use rack_occupancy for counts only). If the user's question needs both which racks are occupied AND what's actually inside them, call rack_occupancy and list_zone_packages together in the same response.",
                        parameters = new
                        {
                            type = "object",
                            properties = new
                            {
                                zoneName = new { type = "string", description = "The zone's name" }
                            },
                            required = new[] { "zoneName" }
                        }
                    }
                }
            },
            // "auto" (not "required") lets the model reply in plain text
            // when the question is ambiguous, instead of being forced to
            // guess a tool call - required would error out on that case.
            tool_choice = "auto"
        };

        var content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");
        var request = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions")
        {
            Content = content
        };
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _apiKey);

        var response = await _httpClient.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync();
            Console.WriteLine($"Groq request failed with status {response.StatusCode}: {errorBody}");
            return new List<AssistantResponseDto> { new AssistantResponseDto { Action = "unknown", Message = "A aparut o eroare la interpretarea cererii." } };
        }

        var responseJson = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(responseJson);

        var message = doc.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message");

        // With tool_choice "auto", the model may just answer in plain text
        // instead of calling a tool - e.g. when the query is ambiguous
        // (no tool_calls property at all in that case).
        if (!message.TryGetProperty("tool_calls", out var toolCalls) || toolCalls.ValueKind != JsonValueKind.Array || toolCalls.GetArrayLength() == 0)
        {
            var textReply = message.TryGetProperty("content", out var contentProp) ? contentProp.GetString() ?? "" : "";
            return new List<AssistantResponseDto> { new AssistantResponseDto { Action = "unknown", Message = textReply } };
        }

        // The model can return more than one tool call in a single response
        // (see the system message above) - loop over all of them instead
        // of only reading the first, so multi-part questions get a
        // complete answer in one round trip.
        var results = new List<AssistantResponseDto>();
        foreach (var toolCall in toolCalls.EnumerateArray())
        {
            var call = toolCall.GetProperty("function");
            var functionName = call.GetProperty("name").GetString() ?? "unknown";
            // Arguments come back as a JSON string, not a parsed object -
            // has to be parsed separately from the outer response.
            var argumentsJson = call.GetProperty("arguments").GetString() ?? "{}";
            using var argsDoc = JsonDocument.Parse(argumentsJson);
            var args = argsDoc.RootElement;

            var result = new AssistantResponseDto { Action = functionName };
            // Only the parameters relevant to this specific tool get
            // extracted - the DTO's other fields stay at their defaults.
            switch (functionName)
            {
                case "operator_activity":
                    result.UserName = args.TryGetProperty("userName", out var userName) ? userName.GetString() ?? "" : "";
                    result.Date = args.TryGetProperty("date", out var date) ? date.GetString() ?? "" : "";
                    break;
                case "find_package":
                    result.Recipient = args.TryGetProperty("recipient", out var recipient) ? recipient.GetString() ?? "" : "";
                    break;
                case "navigate_zone":
                case "rack_occupancy":
                case "list_zone_packages":
                    result.ZoneName = args.TryGetProperty("zoneName", out var zoneName) ? zoneName.GetString() ?? "" : "";
                    break;
            }

            results.Add(result);
        }

        return results;
    }
}
