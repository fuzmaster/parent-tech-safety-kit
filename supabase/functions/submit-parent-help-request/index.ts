import { adminClient, json, optionsResponse } from '../_shared.ts';

const allowedKinds = new Set(['broken', 'scam', 'login']);

Deno.serve(async (request) => {
  const early = optionsResponse(request);
  if (early) return early;
  const { slug, kind, message, diagnostic_payload } = await request.json().catch(() => ({}));
  if (!slug || typeof slug !== 'string') return json({ error: 'Missing slug' }, 400);
  if (!allowedKinds.has(kind)) return json({ error: 'Invalid request type' }, 400);
  const supabase = adminClient();
  const { data: parent, error } = await supabase.from('parent_profiles').select('id').eq('slug', slug).single();
  if (error || !parent) return json({ error: 'Parent page not found' }, 404);
  const payload = diagnostic_payload && typeof diagnostic_payload === 'object' ? diagnostic_payload : {};
  const cleanMessage = typeof message === 'string' ? message.slice(0, 2000) : null;
  const { data, error: insertError } = await supabase.from('help_requests').insert({ parent_id: parent.id, kind, message: cleanMessage, diagnostic_payload: payload }).select('id, created_at').single();
  if (insertError) return json({ error: insertError.message }, 500);
  await supabase.from('parent_profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', parent.id);
  return json({ ok: true, request: data });
});
