import { openUrl } from '@tauri-apps/plugin-opener';

export const LONG_PRESS_MS = 500;
export const DRAG_DISTANCE_PX_SQ = Math.pow(20, 2);

// Only anchors pointing at these hosts (or their subdomains) are routed to the
// system browser; everything else is left to the webview's default behavior.
const ALLOWED_HOSTS = ['github.com', 'dmx-controller.app', 'gdtf-share.com'];
// Only mailto: addresses at these domains are routed to the mail client.
const ALLOWED_EMAIL_DOMAINS = ['dmx-controller.app'];

function isHostAllowed(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((domain) => h === domain || h.endsWith(`.${domain}`));
}

function isAllowedExternalUrl(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }

  switch (url.protocol.toLowerCase()) {
    case 'http:':
    case 'https:':
      return isHostAllowed(url.hostname, ALLOWED_HOSTS);
    case 'mailto:': {
      const address = url.pathname.split(',')[0];
      const domain = address.split('@')[1] ?? '';
      return isHostAllowed(domain, ALLOWED_EMAIL_DOMAINS);
    }
    default:
      return false;
  }
}

export function installExternalLinkHandler(): void {
  document.addEventListener(
    'click',
    (e) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      const anchor = (e.target as HTMLElement | null)?.closest('a');
      // Resolve via the anchor's `.href` so relative bases are handled.
      if (!anchor || !isAllowedExternalUrl(anchor.href)) {
        return;
      }

      e.preventDefault();
      const url = anchor.href;
      openUrl(url).catch(() => {
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    },
    true,
  );
}
