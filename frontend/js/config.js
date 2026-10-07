// Uses whatever host the page itself was loaded from (localhost when testing
// on this machine, the laptop's LAN IP when opened from a phone/other device),
// instead of a hardcoded "localhost" that would only ever resolve locally.
const backendHost = window.location.hostname;
export const API = `http://${backendHost}:5127/api`;
export const HUB_URL = `http://${backendHost}:5127/hubs/warehouse`;