// One source of truth for which web origins may call the API -- used by the
// HTTP API (app.setup.ts) AND both Socket.IO gateways.
//
// Why a function instead of reading process.env in the @WebSocketGateway()
// decorator: decorators run the moment their file is imported, which is
// before ConfigModule has loaded .env. A value read there silently fell
// back to http://localhost:3000, so the live connection refused every
// other address (a phone on the cafe Wi-Fi, the production domain) while
// normal API calls still worked. Reading it per request avoids that.
//
// CORS_ORIGIN can list several origins: "https://pos.example.com,https://www.example.com"
export function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(',').map((o) => o.trim()).filter(Boolean);
}

export const socketCors = {
  credentials: true,
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
    // No Origin header = not a browser (server-to-server, tests) -- allowed,
    // same as the HTTP API; the socket still has to present a valid token.
    cb(null, !origin || allowedOrigins().includes(origin)),
};
