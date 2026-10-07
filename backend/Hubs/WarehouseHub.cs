using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authorization;

namespace WarehouseApi.Hubs;

// Real-time channel clients connect to (see Program.cs's MapHub call).
// Deliberately empty - clients never call methods ON this hub, they only
// listen for the "WarehouseChanged" broadcast that controllers send
// through IHubContext<WarehouseHub> after a mutation. [Authorize] still
// requires a valid JWT to open the connection at all.
[Authorize]
public class WarehouseHub : Hub
{

}