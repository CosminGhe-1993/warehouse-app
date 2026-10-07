using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;
using System.Text;
using WarehouseApi.Services;
using WarehouseApi.Hubs;

var builder = WebApplication.CreateBuilder(args);

// MongoDB - one shared client (thread-safe, meant to be a singleton), plus
// the specific database resolved from it, both registered so services can
// just ask for IMongoDatabase via constructor injection.
builder.Services.AddSingleton<IMongoClient>(new MongoClient(
    builder.Configuration["MongoDb:ConnectionString"]));
builder.Services.AddSingleton(sp =>
    sp.GetRequiredService<IMongoClient>().GetDatabase(
        builder.Configuration["MongoDb:Database"]));

// JWT - validates tokens issued by AuthController on every authenticated request.
var jwtKey = builder.Configuration["Jwt:Key"]!;
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };

        // WebSocket connections (used by SignalR) can't set an Authorization
        // header, so the client sends the token as a query string parameter
        // instead - only accepted for the hub path, not for regular API calls.
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs/warehouse"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers();
builder.Services.AddSignalR(); // Powers the WarehouseHub real-time channel.

// CORS
// SignalR sends requests with credentials included, and browsers reject
// Access-Control-Allow-Origin: "*" (what AllowAnyOrigin sends) when credentials
// are involved. SetIsOriginAllowed reflects back the actual request origin
// instead, which is compatible with AllowCredentials while staying just as
// permissive (any origin still allowed).
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.SetIsOriginAllowed(_ => true).AllowAnyHeader().AllowAnyMethod().AllowCredentials());
});

// Domain services, registered against their interfaces so controllers
// depend on the abstraction (testable/swappable), not the concrete class.
builder.Services.AddSingleton<IUserService, UserService>();
builder.Services.AddSingleton<IRoleService, RoleService>();
builder.Services.AddSingleton<IZoneService, ZoneService>();
builder.Services.AddSingleton<IRackService, RackService>();
builder.Services.AddSingleton<ISlotService, SlotService>();
builder.Services.AddSingleton<IPackageService, PackageService>();
// AddHttpClient (not AddSingleton) because GroqService needs an HttpClient
// injected - this registers a properly pooled/managed one for it.
builder.Services.AddHttpClient<IGroqService, GroqService>();

var app = builder.Build();

// This is a single-page app that never does a full reload between screens,
// so without this the browser can serve a stale cached GET response
// instead of hitting the API again.
app.Use(async (context, next) =>
{
    context.Response.Headers["Cache-Control"] = "no-store";
    await next();
});

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapHub<WarehouseHub>("/hubs/warehouse");
app.MapControllers();

app.Run();