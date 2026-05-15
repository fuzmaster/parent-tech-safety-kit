const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ITERATIONS = 250_000;

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};
const randomBytes = (length: number): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  crypto.getRandomValues(bytes);
  return bytes;
};

async function deriveKey(secretPhrase: string, salt: Uint8Array<ArrayBuffer>) {
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(secretPhrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptPrivateValue(secretPhrase: string, plainText: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(secretPhrase, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plainText));
  return {
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
    salt: toBase64(salt),
    algorithm: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA-256',
    iterations: ITERATIONS,
  };
}

export async function decryptPrivateValue(secretPhrase: string, encrypted: { ciphertext: string; iv: string; salt: string }) {
  const key = await deriveKey(secretPhrase, fromBase64(encrypted.salt));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(encrypted.iv) }, key, fromBase64(encrypted.ciphertext));
  return decoder.decode(plain);
}
