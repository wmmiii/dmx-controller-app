import privacyHtml from '../../web/privacy.html?raw';
import termsHtml from '../../web/terms.html?raw';

interface LegalDoc {
  /** Human-readable title, e.g. "Terms of Service". */
  readonly title: string;
  /** Current version string. Bump when the document is materially updated. */
  readonly version: string;
  /** Inner HTML of the document's <main> element, ready to embed. */
  readonly content: string;
  /** localStorage key holding the accepted version string. */
  readonly versionKey: string;
  /** localStorage key holding the ISO timestamp of acceptance. */
  readonly dateKey: string;
}

export const LEGAL_DOCS = {
  terms: {
    title: 'Terms of Service',
    version: '2026-07-05',
    content: extractMain(termsHtml),
    versionKey: 'legal.termsAcceptedVersion',
    dateKey: 'legal.termsAcceptedDate',
  },
  privacy: {
    title: 'Privacy Policy',
    version: '2026-07-05',
    content: extractMain(privacyHtml),
    versionKey: 'legal.privacyAcceptedVersion',
    dateKey: 'legal.privacyAcceptedDate',
  },
} satisfies Record<string, LegalDoc>;

export type LegalDocId = keyof typeof LEGAL_DOCS;

function extractMain(html: string): string {
  const main = new DOMParser()
    .parseFromString(html, 'text/html')
    .querySelector('main');
  return main?.innerHTML ?? html;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getAcceptedVersion(doc: LegalDocId): string | null {
  return readStorage(LEGAL_DOCS[doc].versionKey);
}

export function getAcceptedDate(doc: LegalDocId): string | null {
  return readStorage(LEGAL_DOCS[doc].dateKey);
}

export function isAccepted(doc: LegalDocId): boolean {
  return getAcceptedVersion(doc) === LEGAL_DOCS[doc].version;
}

export function hasAcceptedBefore(): boolean {
  return getAcceptedDate('terms') != null || getAcceptedDate('privacy') != null;
}

export function acceptDocument(doc: LegalDocId): void {
  const { versionKey, version, dateKey } = LEGAL_DOCS[doc];
  try {
    localStorage.setItem(dateKey, new Date().toISOString());
    localStorage.setItem(versionKey, version);
  } catch {
    // If storage is unavailable the caller still proceeds for this session
    // rather than trapping the user behind the gate.
  }
}
