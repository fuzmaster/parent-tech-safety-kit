import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, HeartPulse, Home, Loader2, LogOut, Phone, Printer, ShieldCheck, Smartphone, UserPlus } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { decryptPrivateValue, encryptPrivateValue } from './crypto';
import { edgeFunctionUrl, isSupabaseConfigured, supabase } from './supabase';
import type { BinderItem, DiagnosticPayload, EncryptedBinderItem, HelpRequest, HelpRequestKind, HelperContact, ParentProfile, PublicParentConfig } from './types';

type View = 'dashboard' | 'binder' | 'print';

const helpLabels: Record<HelpRequestKind, { title: string; helperTitle: string; description: string; icon: string }> = {
  broken: { title: 'Something is broken', helperTitle: 'Something is broken', description: 'Computer, phone, TV, printer, or internet problem.', icon: '🛠️' },
  scam: { title: 'I think this is a scam', helperTitle: 'Possible scam', description: 'Strange call, text, email, popup, or request for money.', icon: '🚨' },
  login: { title: "I can't log in", helperTitle: 'Login trouble', description: 'Password, code, account, or website sign-in problem.', icon: '🔑' },
};

const diagnosticPayload = (): DiagnosticPayload => ({
  userAgent: navigator.userAgent,
  language: navigator.language,
  platform: navigator.platform,
  viewport: `${window.innerWidth}x${window.innerHeight}`,
  online: navigator.onLine,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  localTime: new Date().toISOString(),
  url: window.location.href,
});

function useHashRoute() {
  const [route, setRoute] = useState(window.location.hash || '#/');
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

function App() {
  const route = useHashRoute();
  if (route.startsWith('#/p/')) return <ParentPage slug={route.replace('#/p/', '').split('/')[0]} />;
  return <HelperApp />;
}

function HelperApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (loading) return <FullPageLoader label="Loading your safety kit" />;
  if (!session) return <AuthScreen />;
  return <Dashboard session={session} />;
}

function SetupNotice() {
  return <main className="mx-auto max-w-3xl p-6 sm:p-10"><div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 shadow-sm"><ShieldCheck className="mb-4 h-12 w-12 text-teal-700" /><h1 className="text-3xl font-bold">Parent Tech Safety Kit</h1><p className="mt-4 text-lg text-slate-700">Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your environment, run the Supabase migration, and deploy the Edge Functions to start the MVP.</p></div></main>;
}

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const action = mode === 'sign-up' ? supabase.auth.signUp({ email, password }) : supabase.auth.signInWithPassword({ email, password });
    const { error } = await action;
    setBusy(false);
    setMessage(error ? error.message : mode === 'sign-up' ? 'Check your email if confirmation is enabled, then sign in.' : 'Signed in.');
  };

  return <main className="grid min-h-screen place-items-center p-6"><form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-200"><ShieldCheck className="h-12 w-12 text-teal-700" /><h1 className="mt-4 text-3xl font-black">Parent Tech Safety Kit</h1><p className="mt-2 text-slate-600">Sign in as the adult child or trusted helper.</p><label className="mt-6 block text-sm font-bold">Email<input className="mt-2 w-full rounded-xl border border-slate-300 p-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label className="mt-4 block text-sm font-bold">Password<input className="mt-2 w-full rounded-xl border border-slate-300 p-3" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></label><button disabled={busy} className="mt-6 w-full rounded-xl bg-teal-700 px-4 py-3 font-bold text-white hover:bg-teal-800 disabled:opacity-60">{busy ? 'Please wait…' : mode === 'sign-up' ? 'Create helper account' : 'Sign in'}</button><button type="button" className="mt-4 w-full text-sm font-semibold text-teal-800" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>{mode === 'sign-in' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}</button>{message && <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm">{message}</p>}</form></main>;
}

function Dashboard({ session }: { session: Session }) {
  const [parents, setParents] = useState<ParentProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [requests, setRequests] = useState<HelpRequest[]>([]);
  const [contacts, setContacts] = useState<HelperContact[]>([]);
  const [binderItems, setBinderItems] = useState<BinderItem[]>([]);
  const [privateItems, setPrivateItems] = useState<EncryptedBinderItem[]>([]);
  const [view, setView] = useState<View>('dashboard');
  const [busy, setBusy] = useState(false);

  const selected = parents.find((parent) => parent.id === selectedId) ?? parents[0];

  const loadParents = useCallback(async () => {
    const { data } = await supabase.from('parent_profiles').select('*').order('created_at', { ascending: true });
    const next = (data ?? []) as ParentProfile[];
    setParents(next);
    if (!selectedId && next[0]) setSelectedId(next[0].id);
  }, [selectedId]);

  const loadSelected = useCallback(async () => {
    if (!selected?.id) return;
    const [requestResult, contactResult, binderResult, privateResult] = await Promise.all([
      supabase.from('help_requests').select('*').eq('parent_id', selected.id).order('created_at', { ascending: false }),
      supabase.from('helper_contacts').select('*').eq('parent_id', selected.id).order('sort_order'),
      supabase.from('binder_items').select('*').eq('parent_id', selected.id).order('sort_order'),
      supabase.from('encrypted_binder_items').select('*').eq('parent_id', selected.id).order('created_at', { ascending: false }),
    ]);
    setRequests((requestResult.data ?? []) as HelpRequest[]);
    setContacts((contactResult.data ?? []) as HelperContact[]);
    setBinderItems((binderResult.data ?? []) as BinderItem[]);
    setPrivateItems((privateResult.data ?? []) as EncryptedBinderItem[]);
  }, [selected?.id]);

  useEffect(() => { void loadParents(); }, [loadParents]);
  useEffect(() => { void loadSelected(); }, [loadSelected]);

  const createParent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get('displayName') || '').trim();
    const emergencyNote = String(form.get('emergencyNote') || '').trim();
    if (!displayName) return;
    setBusy(true);
    const slug = `${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${crypto.randomUUID().slice(0, 8)}`;
    const { data } = await supabase.from('parent_profiles').insert({ helper_user_id: session.user.id, display_name: displayName, emergency_note: emergencyNote, slug }).select().single();
    setBusy(false);
    event.currentTarget.reset();
    await loadParents();
    if (data) setSelectedId((data as ParentProfile).id);
  };

  const parentUrl = selected ? `${window.location.origin}${window.location.pathname}#/p/${selected.slug}` : '';

  return <main className="min-h-screen"><header className="no-print border-b bg-white"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-black text-slate-950">Parent Tech Safety Kit</h1><p className="text-sm text-slate-600">Logged in as {session.user.email}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => setView('dashboard')} className="rounded-xl bg-slate-100 px-4 py-2 font-bold">Dashboard</button><button onClick={() => setView('binder')} className="rounded-xl bg-slate-100 px-4 py-2 font-bold">Binder editor</button><button onClick={() => setView('print')} className="rounded-xl bg-slate-100 px-4 py-2 font-bold">Print binder</button><button onClick={() => supabase.auth.signOut()} className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white"><LogOut className="inline h-4 w-4" /> Sign out</button></div></div></header><section className="mx-auto grid max-w-7xl gap-6 p-4 lg:grid-cols-[360px_1fr]"><aside className="no-print space-y-4"><CreateParentForm busy={busy} onSubmit={createParent} /><div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><h2 className="font-black">Parent profiles</h2><div className="mt-3 space-y-2">{parents.map((parent) => <button key={parent.id} onClick={() => setSelectedId(parent.id)} className={`w-full rounded-2xl p-3 text-left font-bold ${selected?.id === parent.id ? 'bg-teal-700 text-white' : 'bg-slate-100'}`}>{parent.display_name}<span className="block text-xs opacity-80">Last seen: {parent.last_seen_at ? new Date(parent.last_seen_at).toLocaleString() : 'Never'}</span></button>)}</div></div></aside>{selected ? <section className="space-y-6">{view === 'dashboard' && <DashboardPanel selected={selected} parentUrl={parentUrl} requests={requests} contacts={contacts} reload={loadSelected} />}{view === 'binder' && <BinderEditor parent={selected} binderItems={binderItems} privateItems={privateItems} reload={loadSelected} />}{view === 'print' && <PrintBinder parent={selected} contacts={contacts} binderItems={binderItems} privateItems={privateItems} />}</section> : <EmptyState />}</section></main>;
}

function CreateParentForm({ busy, onSubmit }: { busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={onSubmit} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><UserPlus className="h-8 w-8 text-teal-700" /><h2 className="mt-2 font-black">Create parent profile</h2><input name="displayName" placeholder="Parent display name" className="mt-4 w-full rounded-xl border p-3" required /><textarea name="emergencyNote" placeholder="Plain-language emergency note shown on parent page" className="mt-3 w-full rounded-xl border p-3" rows={3} /><button disabled={busy} className="mt-3 w-full rounded-xl bg-teal-700 p-3 font-bold text-white disabled:opacity-60">Create profile</button></form>;
}

function DashboardPanel({ selected, parentUrl, requests, contacts, reload }: { selected: ParentProfile; parentUrl: string; requests: HelpRequest[]; contacts: HelperContact[]; reload: () => Promise<void> }) {
  return <><div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><h2 className="text-2xl font-black">{selected.display_name}</h2><p className="mt-2 text-slate-600">Private help URL for their home screen:</p><div className="mt-3 break-all rounded-2xl bg-teal-50 p-4 font-mono text-sm text-teal-900">{parentUrl}</div><button onClick={() => navigator.clipboard.writeText(parentUrl)} className="mt-3 rounded-xl bg-teal-700 px-4 py-2 font-bold text-white">Copy URL</button><p className="mt-4 flex items-center gap-2 text-sm text-slate-600"><HeartPulse className="h-4 w-4" /> Last seen: {selected.last_seen_at ? new Date(selected.last_seen_at).toLocaleString() : 'No heartbeat yet'}</p></div><ContactManager parentId={selected.id} contacts={contacts} reload={reload} /><div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><h2 className="text-2xl font-black">Help requests</h2><div className="mt-4 space-y-4">{requests.length === 0 && <p className="rounded-2xl bg-slate-100 p-4 text-slate-600">No requests yet.</p>}{requests.map((request) => <article key={request.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-black">{helpLabels[request.kind].icon} {helpLabels[request.kind].helperTitle}</h3><p className="text-sm text-slate-500">{new Date(request.created_at).toLocaleString()}</p></div>{request.resolved_at && <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-800">Resolved</span>}</div>{request.message && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-slate-800">{request.message}</p>}<details className="mt-3"><summary className="cursor-pointer font-bold text-teal-800">Browser diagnostic payload</summary><pre className="mt-2 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-50">{JSON.stringify(request.diagnostic_payload, null, 2)}</pre></details></article>)}</div></div></>;
}

function ContactManager({ parentId, contacts, reload }: { parentId: string; contacts: HelperContact[]; reload: () => Promise<void> }) {
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await supabase.from('helper_contacts').insert({ parent_id: parentId, name: form.get('name'), relationship: form.get('relationship'), phone: form.get('phone'), email: form.get('email'), sort_order: contacts.length + 1 });
    event.currentTarget.reset();
    await reload();
  };
  return <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><h2 className="text-2xl font-black">Helper contacts</h2><form onSubmit={add} className="mt-4 grid gap-3 md:grid-cols-5"><input name="name" required placeholder="Name" className="rounded-xl border p-3" /><input name="relationship" placeholder="Relationship" className="rounded-xl border p-3" /><input name="phone" placeholder="Phone" className="rounded-xl border p-3" /><input name="email" placeholder="Email" className="rounded-xl border p-3" /><button className="rounded-xl bg-teal-700 p-3 font-bold text-white">Add</button></form><div className="mt-4 grid gap-3 md:grid-cols-2">{contacts.map((contact) => <div key={contact.id} className="rounded-2xl bg-slate-100 p-4"><p className="font-black">{contact.name}</p><p className="text-sm text-slate-600">{contact.relationship}</p><div className="mt-2 flex gap-2">{contact.phone && <><a className="rounded-lg bg-white px-3 py-2 font-bold" href={`tel:${contact.phone}`}>Call</a><a className="rounded-lg bg-white px-3 py-2 font-bold" href={`sms:${contact.phone}`}>Text</a></>}{contact.email && <a className="rounded-lg bg-white px-3 py-2 font-bold" href={`mailto:${contact.email}`}>Email</a>}</div></div>)}</div></div>;
}

function BinderEditor({ parent, binderItems, privateItems, reload }: { parent: ParentProfile; binderItems: BinderItem[]; privateItems: EncryptedBinderItem[]; reload: () => Promise<void> }) {
  const [secret, setSecret] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const addPublic = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); await supabase.from('binder_items').insert({ parent_id: parent.id, section: form.get('section'), label: form.get('label'), public_value: form.get('public_value'), sort_order: binderItems.length + 1 }); event.currentTarget.reset(); await reload(); };
  const addPrivate = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!secret) return alert('Enter the family secret phrase first. It stays only in this browser.'); const form = new FormData(event.currentTarget); const encrypted = await encryptPrivateValue(secret, String(form.get('private_value') || '')); await supabase.from('encrypted_binder_items').insert({ parent_id: parent.id, label: form.get('label'), ...encrypted }); event.currentTarget.reset(); await reload(); };
  const reveal = async (item: EncryptedBinderItem) => { try { setRevealed((prev) => ({ ...prev, [item.id]: 'Decrypting…' })); const value = await decryptPrivateValue(secret, item); setRevealed((prev) => ({ ...prev, [item.id]: value })); } catch { setRevealed((prev) => ({ ...prev, [item.id]: 'Could not decrypt. Check the family secret phrase.' })); } };
  return <div className="space-y-6"><div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><h2 className="text-2xl font-black"><BookOpen className="inline h-6 w-6" /> Printable Family Tech Binder</h2><form onSubmit={addPublic} className="mt-4 grid gap-3 md:grid-cols-4"><input name="section" placeholder="Section" className="rounded-xl border p-3" required /><input name="label" placeholder="Label" className="rounded-xl border p-3" required /><input name="public_value" placeholder="Safe-to-print value" className="rounded-xl border p-3 md:col-span-1" required /><button className="rounded-xl bg-teal-700 p-3 font-bold text-white">Add public item</button></form><div className="mt-4 grid gap-3">{binderItems.map((item) => <div key={item.id} className="rounded-2xl bg-slate-100 p-4"><p className="text-xs font-bold uppercase text-slate-500">{item.section}</p><p className="font-black">{item.label}</p><p>{item.public_value}</p></div>)}</div></div><div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><h2 className="text-2xl font-black">Encrypted private binder items</h2><p className="mt-2 text-slate-600">The family secret phrase is never sent to Supabase. Only ciphertext, IV, salt, algorithm metadata, and labels are stored.</p><input value={secret} onChange={(e) => setSecret(e.target.value)} type="password" placeholder="Family secret phrase (keep private)" className="mt-4 w-full rounded-xl border p-3" /><form onSubmit={addPrivate} className="mt-4 grid gap-3 md:grid-cols-3"><input name="label" placeholder="Label, e.g. Wi-Fi password" className="rounded-xl border p-3" required /><input name="private_value" placeholder="Secret value to encrypt" className="rounded-xl border p-3" required /><button className="rounded-xl bg-slate-900 p-3 font-bold text-white">Encrypt and save</button></form><div className="mt-4 grid gap-3">{privateItems.map((item) => <div key={item.id} className="rounded-2xl bg-slate-100 p-4"><p className="font-black">{item.label}</p><p className="text-xs text-slate-500">{item.algorithm} · {item.kdf} · {item.iterations.toLocaleString()} iterations</p><button onClick={() => reveal(item)} className="mt-2 rounded-lg bg-white px-3 py-2 font-bold">Decrypt in this browser</button>{revealed[item.id] && <p className="mt-2 rounded-xl bg-white p-3">{revealed[item.id]}</p>}</div>)}</div></div></div>;
}

function PrintBinder({ parent, contacts, binderItems, privateItems }: { parent: ParentProfile; contacts: HelperContact[]; binderItems: BinderItem[]; privateItems: EncryptedBinderItem[] }) {
  return <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200"><button onClick={() => window.print()} className="no-print mb-6 rounded-xl bg-teal-700 px-4 py-2 font-bold text-white"><Printer className="inline h-4 w-4" /> Print</button><h1 className="text-4xl font-black">Family Tech Binder</h1><p className="mt-2 text-xl">For {parent.display_name}</p><section className="print-card mt-8 rounded-2xl border p-5"><h2 className="text-2xl font-black">Trusted helpers</h2>{contacts.map((contact) => <p key={contact.id} className="mt-3 text-lg"><strong>{contact.name}</strong> {contact.relationship ? `(${contact.relationship})` : ''}<br />{contact.phone} {contact.email}</p>)}</section><section className="print-card mt-6 rounded-2xl border p-5"><h2 className="text-2xl font-black">Important tech notes</h2>{binderItems.map((item) => <p key={item.id} className="mt-3"><strong>{item.section} — {item.label}:</strong> {item.public_value}</p>)}</section><section className="print-card mt-6 rounded-2xl border p-5"><h2 className="text-2xl font-black">Private encrypted items</h2><p>Private item values are not printed from the server. Decrypt them in the binder editor with the family secret phrase if you choose to write them by hand.</p>{privateItems.map((item) => <p key={item.id} className="mt-3"><strong>{item.label}</strong> — encrypted with {item.algorithm}</p>)}</section></div>;
}

function ParentPage({ slug }: { slug: string }) {
  const [config, setConfig] = useState<PublicParentConfig | null>(null);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<HelpRequestKind | null>(null);

  useEffect(() => {
    fetch(edgeFunctionUrl('get-public-parent-config'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    }).then((res) => res.json()).then(setConfig).catch(() => undefined);

    const heartbeat = () => fetch(edgeFunctionUrl('record-parent-heartbeat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, diagnostic_payload: diagnosticPayload() }),
    }).catch(() => undefined);

    heartbeat();
    const id = window.setInterval(heartbeat, 60_000);
    return () => window.clearInterval(id);
  }, [slug]);

  const submit = async (kind: HelpRequestKind) => {
    setSent(kind);
    await fetch(edgeFunctionUrl('submit-parent-help-request'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, kind, message, diagnostic_payload: diagnosticPayload() }),
    });
    setMessage('');
  };

  return (
    <main className="min-h-screen bg-teal-50 p-4 sm:p-8">
      <section className="mx-auto max-w-3xl">
        <div className="rounded-[2rem] bg-white p-6 shadow-xl sm:p-10">
          <div className="flex items-center gap-4">
            <Home className="h-12 w-12 text-teal-700" />
            <div>
              <h1 className="text-4xl font-black sm:text-5xl">Need tech help?</h1>
              <p className="mt-2 text-2xl text-slate-700">
                {config?.parent.display_name ? `Hi ${config.parent.display_name}. Tap one big button below.` : 'Tap one big button below.'}
              </p>
            </div>
          </div>

          {config?.parent.emergency_note && (
            <p className="mt-6 rounded-3xl bg-amber-100 p-5 text-2xl font-bold text-amber-950">{config.parent.emergency_note}</p>
          )}

          <div className="mt-8 grid gap-5">
            {(Object.keys(helpLabels) as HelpRequestKind[]).map((kind) => (
              <button key={kind} onClick={() => submit(kind)} className="rounded-[2rem] border-4 border-teal-800 bg-teal-700 p-7 text-left text-white shadow-lg active:scale-[0.99]">
                <span className="text-5xl" aria-hidden>{helpLabels[kind].icon}</span>
                <span className="ml-4 align-middle text-3xl font-black sm:text-4xl">{helpLabels[kind].title}</span>
                <span className="mt-3 block text-xl text-teal-50">{helpLabels[kind].description}</span>
              </button>
            ))}
          </div>

          <label className="mt-8 block text-2xl font-black">
            Optional note
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="mt-3 h-32 w-full rounded-3xl border-4 border-slate-300 p-5 text-2xl" placeholder="Type a short note, or leave this blank." />
          </label>

          {sent && (
            <p className="mt-6 flex items-center gap-3 rounded-3xl bg-green-100 p-5 text-2xl font-black text-green-900">
              <CheckCircle2 className="h-9 w-9" /> Help request sent. A trusted helper can see it now.
            </p>
          )}

          <div className="mt-8 rounded-3xl bg-slate-100 p-5">
            <h2 className="text-2xl font-black"><Phone className="inline h-7 w-7" /> Trusted helpers</h2>
            <div className="mt-4 grid gap-3">
              {config?.contacts.map((contact) => (
                <div key={`${contact.name}-${contact.phone}`} className="rounded-2xl bg-white p-4 text-xl">
                  <strong>{contact.name}</strong>{contact.relationship && <span> — {contact.relationship}</span>}
                  <div className="mt-3 flex flex-wrap gap-3">
                    {contact.phone && (
                      <>
                        <a className="rounded-xl bg-teal-700 px-5 py-3 font-black text-white" href={`tel:${contact.phone}`}>Call</a>
                        <a className="rounded-xl bg-teal-700 px-5 py-3 font-black text-white" href={`sms:${contact.phone}`}>Text</a>
                      </>
                    )}
                    {contact.email && <a className="rounded-xl bg-white px-5 py-3 font-black text-teal-800 ring-2 ring-teal-700" href={`mailto:${contact.email}`}>Email</a>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-6 flex items-center gap-2 text-lg text-slate-600"><Smartphone className="h-6 w-6" /> Tip: add this page to the home screen so it opens like an app.</p>
        </div>
      </section>
    </main>
  );
}

function FullPageLoader({ label }: { label: string }) { return <main className="grid min-h-screen place-items-center"><p className="flex items-center gap-3 text-xl font-bold"><Loader2 className="h-6 w-6 animate-spin" /> {label}</p></main>; }
function EmptyState() { return <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200"><AlertTriangle className="mx-auto h-10 w-10 text-amber-600" /><h2 className="mt-3 text-2xl font-black">Create a parent profile to begin.</h2></div>; }

export default App;
