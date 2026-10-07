namespace WarehouseApi.Dto;

// Body of POST /api/auth/login.
public class LoginRequestDto
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}
