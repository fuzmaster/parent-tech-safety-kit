import { adminClient, json, optionsResponse } from '../_shared.ts';

Deno.serve(async (request) => {
  const early = optionsResponse(request);
  if (early) return early;
  const { slug } = await request.json().catch(() => ({}));
  if (!slug || typeof slug !== 'string') return json({ error: 'Missing slug' }, 400);
  const supabase = adminClient();
  const { data: parent, error } = await supabase.from('parent_profiles').select('id, display_name, emergency_note, last_seen_at').eq('slug', slug).single();
  if (error || !parent) return json({ error: 'Parent page not found' }, 404);
  const { data: contacts } = await supabase.from('helper_contacts').select('name, relationship, phone, email, sort_order').eq('parent_id', parent.id).order('sort_order');
  return json({ parent: { display_name: parent.display_name, emergency_note: parent.emergency_note, last_seen_at: parent.last_seen_at }, contacts: contacts ?? [] });
});
