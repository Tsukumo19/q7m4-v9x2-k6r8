# Tavern ChatGPT connection

Status: local tests pass. OAuth registration and real ChatGPT end-to-end verification are still required. Empty client allowlists intentionally disable writes and consent. Do not describe this as operational until a real ChatGPT tool call succeeds.

This is a stateless Streamable HTTP MCP server, hosted in the existing Supabase project. It exposes only `tavern_scoreboard` and `tavern_record_match`. No SQL, secrets-read, user management, migrations, or service credentials are exposed. The server uses a public publishable key and forwards the verified administrator's OAuth access token to the existing RPC. It never changes opening balances or imports historical snapshots.

OAuth access tokens use Supabase's `authenticated` audience, not a made-up custom scope. The server also pins the issuer, role and registered OAuth `client_id`, verifies expiry and subject, and asks the Auth server to validate the token. The database must separately deny OAuth clients access to `admin_records`, and allow only the registered client in `record_match`. The existing whitelist and UUID/payload equality checks remain authoritative. Do not enable the allowlist before both database guards are tested.

## Remaining setup

1. Publish `site/oauth-consent.html`, `oauth-consent.js`, and `oauth-config.js` to the existing Pages site. Consent is fail-closed until the approved client ID is configured. Tokens are held only in page memory, never in URLs, logs, chat messages or persistent browser storage.
2. Apply only `db/restrict-oauth.sql` as an incremental migration, preserving existing functions and data. It blocks OAuth secret reads and temporarily blocks OAuth writes. Do not execute `db/schema.sql`.
3. Configure Supabase Auth Site URL `https://tsukumo19.github.io/q7m4-v9x2-k6r8` and OAuth authorization path `/oauth-consent.html`. Keep dynamic registration off; register one public PKCE client with the exact callback copied from ChatGPT's custom MCP configuration. Never use a wildcard callback or ask for a secret in chat.
4. Connect the remote MCP URL `https://gyclhkyjjmeifzyvzwlm.supabase.co/functions/v1/tavern-mcp` as a ChatGPT plugin using OAuth. The resource metadata is at that URL plus `/.well-known/oauth-protected-resource`. Supabase issuer is `https://gyclhkyjjmeifzyvzwlm.supabase.co/auth/v1`; authorization-server discovery is `https://gyclhkyjjmeifzyvzwlm.supabase.co/.well-known/oauth-authorization-server/auth/v1`.
5. Pin the registered public client ID in `mcp/index.ts` and `site/oauth-config.js`. Replace the temporary OAuth write denial with a check permitting that exact client and rejecting all other OAuth clients; also reject non-null true scores and nonempty secret notes for OAuth submissions. Leave first-party browser login behavior unchanged. Use no token hook or new schema unless actually needed.
6. Deploy with gateway JWT verification off because MCP initialization and tool discovery are public; the handler performs authentication on every write. No unauthenticated write path is present. GET returns 405 as permitted for stateless Streamable HTTP.

## Acceptance

Run `npm test`. Tests mock the network and validate protocol, token rejection, payload validation, caller-token propagation, net amount semantics, timeout ambiguity and RPC rejection; they are not a real OAuth or database integration test.

Production acceptance must verify anonymous scoreboard access; anonymous and non-admin write denial; OAuth secret read denial at the database; administrator UUID replay and changed-payload conflict; unknown outcomes retried with the same ID; then invoke the plugin from an ordinary ChatGPT conversation. Use a database transaction that rolls back for synthetic write tests. Do not persist a fake match or use the four pending matches as test data. Confirm real entries separately.

ChatGPT on the web supports custom MCP plugins with write tools: https://developers.openai.com/api/docs/guides/custom-mcp-server . An unconnected ordinary chat has no access merely because it knows the URL. A tool working in Codex does not prove availability in the original D&D chat. ChatGPT login and user OAuth consent are required interactive steps.

Rollback: disable the ChatGPT plugin and remove its client allowlist to stop writes. Keep the OAuth secret guard. No table or legacy data needs deletion.

## Deployment record (2026-10-19)

The sole public PKCE client is `a249d613-9635-4e8d-90a6-42e5fef15a05`. OAuth is enabled with dynamic registration disabled. The current first-party consent page is `/oauth-consent.html`. The MCP function is deployed at version 3 and both client allowlists are configured. `db/enable-tavern-client.sql` was applied after the initial denial guard: only this client can submit as an existing administrator, and OAuth requests cannot supply true scores or secret notes. Admin secrets remain inaccessible to OAuth clients.

The database transaction tests passed and rolled back: approved OAuth administrator submission, same-UUID replay, payload conflict, unauthorized client, non-admin, secret read and secret write denial. No permanent test match was inserted. Local tests: 17 passed. The first real browser OAuth run found that authorization IDs are opaque (for example a 32-character lowercase string), not match UUIDs; the consent validator was corrected. Actual user login/consent and an ordinary-chat tool call are still pending. The installed personal plugin is `plugin_asdk_app_6ad6214814dc819192f00406210fd178` (Tavern 账簿). Do not create a duplicate.

