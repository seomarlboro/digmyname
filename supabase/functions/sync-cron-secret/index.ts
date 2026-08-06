import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const token = req.headers.get('x-sync-token')
  if (!token) return json({ ok: false, reason: 'no_token' }, 401)

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) return json({ ok: false, reason: 'no_env' }, 500)

  try {
    const client = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await client.rpc('_sync_cron_secret', {
      p_token: token,
      p_val: cronSecret,
    })

    if (error) return json({ ok: false, error: error.message }, 400)
    return json({ ok: true, result: data }, 200)
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'unknown_error' }, 500)
  }
})
