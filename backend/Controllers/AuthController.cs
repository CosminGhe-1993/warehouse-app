using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using WarehouseApi.Dto;
using WarehouseApi.Models;
using WarehouseApi.Services;
using Microsoft.AspNetCore.Authorization;

namespace WarehouseApi.Controllers;

// Registration, login and permission lookup - the only endpoints that
// don't require [Authorize] (except GetPermissions, which needs a valid
// token to know which user's permissions to return).
[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IUserService _userService;
    private readonly IConfiguration _config;

    public AuthController(IUserService userService, IConfiguration config)
    {
        _userService = userService;
        _config = config;
    }

    [HttpPost("register")]
    public async Task<ActionResult> Register([FromBody] RegisterRequestDto request)
    {
        var existing = await _userService.GetByEmailAsync(request.Email);
        if (existing != null)
        {
            return BadRequest("Email deja folosit.");
        }

        var user = new User
        {
            Name = request.Name,
            Email = request.Email,
            // Never store the raw password - BCrypt hashes it (with its
            // own random salt baked into the hash).
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            RoleId = request.RoleId
        };

        await _userService.CreateAsync(user);
        return Ok("Utilizator creat.");
    }

    [HttpPost("login")]
    public async Task<ActionResult> Login([FromBody] LoginRequestDto request)
    {
        var user = await _userService.GetByEmailAsync(request.Email);
        if (user == null)
        {
            return Unauthorized("Email sau parola incorecte.");
        }

        // BCrypt.Verify re-hashes the given password with the salt from
        // the stored hash and compares - never decrypts anything.
        var valid = BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash);
        if (!valid)
        {
            return Unauthorized("Email sau parola incorecte.");
        }

        // Build and sign a JWT carrying the identity claims every other
        // endpoint reads (NameIdentifier for "who", roleId for permission
        // checks in RequirePermissionAttribute).
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Name, user.Name),
            new Claim("roleId", user.RoleId)
        };

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddHours(double.Parse(_config["Jwt:ExpiresInHours"]!)),
            signingCredentials: creds
        );

        return Ok(new { token = new JwtSecurityTokenHandler().WriteToken(token) });
    }

    // Called once after login so the frontend knows which buttons/actions
    // to show, without re-deriving permissions from the role on the client.
    [HttpGet("permissions")]
    [Authorize]
    public async Task<ActionResult<PermissionsResponseDto>> GetPermissions()
    {
        var permissions = await _userService.GetPermissionsAsync(User);
        if (permissions == null)
        {
            return Unauthorized();
        }

        return Ok(new PermissionsResponseDto { Permissions = permissions });
    }
}