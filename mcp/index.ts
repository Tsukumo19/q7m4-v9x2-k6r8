import { createHandler } from './handler.js';
const baseUrl = 'https://gyclhkyjjmeifzyvzwlm.supabase.co';
// Public PKCE client identifier; never a credential.
const allowedClientIds: string[] = ['a249d613-9635-4e8d-90a6-42e5fef15a05'];
Deno.serve(createHandler({
  baseUrl,
  publishableKey: 'sb_publishable_mI7S1Xb9Xek_3jBsL92_0w_7z21BaVI',
  resource: baseUrl + '/functions/v1/tavern-mcp',
  allowedClientIds,
}));

