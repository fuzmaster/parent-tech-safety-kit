export type HelpRequestKind = 'broken' | 'scam' | 'login';

export type ParentProfile = {
  id: string;
  helper_user_id: string;
  display_name: string;
  slug: string;
  emergency_note: string | null;
  last_seen_at: string | null;
  created_at: string;
};

export type HelperContact = {
  id: string;
  parent_id: string;
  name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  sort_order: number;
};

export type HelpRequest = {
  id: string;
  parent_id: string;
  kind: HelpRequestKind;
  message: string | null;
  diagnostic_payload: DiagnosticPayload;
  created_at: string;
  resolved_at: string | null;
};

export type DiagnosticPayload = {
  userAgent: string;
  language: string;
  platform: string;
  viewport: string;
  online: boolean;
  timezone: string;
  localTime: string;
  url?: string;
};

export type BinderItem = {
  id: string;
  parent_id: string;
  section: string;
  label: string;
  public_value: string | null;
  sort_order: number;
};

export type EncryptedBinderItem = {
  id: string;
  parent_id: string;
  label: string;
  ciphertext: string;
  iv: string;
  salt: string;
  algorithm: string;
  kdf: string;
  iterations: number;
  created_at: string;
};

export type PublicParentConfig = {
  parent: Pick<ParentProfile, 'display_name' | 'emergency_note' | 'last_seen_at'>;
  contacts: Pick<HelperContact, 'name' | 'relationship' | 'phone' | 'email' | 'sort_order'>[];
};
