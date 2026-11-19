import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export type Authed = { user: User; client: SupabaseClient }

/**
 * The anon key is a signed JWT, so the gateway's verify_jwt check is not enough.
 * Require a real logged-in user. Never trust a user id from the request body.
 */
export async function requireUser(req: Request): Promise<Authed | { response: Response }> {
  const header = req.headers.get('Authorization') || ''
  const token = header.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!token) return { response: jsonResponse({ error: 'Login required' }, 401) }

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!url || !anon) return { response: jsonResponse({ error: 'Login required' }, 401) }

  const client = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return { response: jsonResponse({ error: 'Login required' }, 401) }
  return { user: data.user, client }
}
