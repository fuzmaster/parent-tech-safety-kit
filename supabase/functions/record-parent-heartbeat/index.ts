import { adminClient, json, optionsResponse } from '../_shared.ts';

Deno.serve(async (request) => {
  const early = optionsResponse(request);
  if (early) return early;
  const { slug, diagnostic_payload } = await request.json().catch(() => ({}));
  if (!slug || typeof slug !== 'string') return json({ error: 'Missing slug' }, 400);
  const supabase = adminClient();
  const { data: parent, error } = await supabase.from('parent_profiles').select('id').eq('slug', slug).single();
  if (error || !parent) return json({ error: 'Parent page not found' }, 404);
  const payload = diagnostic_payload && typeof diagnostic_payload === 'object' ? diagnostic_payload : {};
  await supabase.from('parent_heartbeats').insert({ parent_id: parent.id, diagnostic_payload: payload });
  await supabase.from('parent_profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', parent.id);
  return json({ ok: true });
});
