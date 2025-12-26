/**
 * Generates a deterministic UUID v5 from a string using SHA-1 hashing.
 * This ensures the same input string always produces the same UUID.
 */
export async function getUuidByString(str: string): Promise<string> {
  // UUID v5 namespace for DNS (standard namespace)
  const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  // Convert namespace UUID to bytes
  const namespaceBytes = new Uint8Array(16);
  const nsHex = namespace.replace(/-/g, '');
  for (let i = 0; i < 16; i++) {
    namespaceBytes[i] = parseInt(nsHex.substr(i * 2, 2), 16);
  }

  // Combine namespace bytes with string bytes
  const encoder = new TextEncoder();
  const strBytes = encoder.encode(str);
  const combined = new Uint8Array(namespaceBytes.length + strBytes.length);
  combined.set(namespaceBytes);
  combined.set(strBytes, namespaceBytes.length);

  // Hash using SHA-1
  const hashBuffer = await crypto.subtle.digest('SHA-1', combined);
  const hashArray = new Uint8Array(hashBuffer);

  // Set version (5) and variant bits according to RFC 4122
  hashArray[6] = (hashArray[6] & 0x0f) | 0x50; // Version 5
  hashArray[8] = (hashArray[8] & 0x3f) | 0x80; // Variant 10

  // Convert to UUID string format
  const hex = Array.from(hashArray.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
