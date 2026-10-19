import { createHandler } from './handler.js';
const baseUrl = 'https://gyclhkyjjmeifzyvzwlm.supabase.co';
// Client IDs are public identifiers, not secrets. Empty until ChatGPT registration.
const allowedClientIds: string[] = [];
Deno.serve(createHandler({
  baseUrl,
  publishableKey: 'sb_publishable_mI7S1Xb9Xek_3jBsL92_0w_7z21BaVI',
  resource: baseUrl + '/functions/v1/tavern-mcp',
  allowedClientIds,
}));

