// Deep links: sharechef://open/<path>
//
// Used by App Store In-App Events ("Open the app" links) and anything else that
// needs to drop someone on a specific screen. The scheme is registered in
// ios/App/App/Info.plist (CFBundleURLTypes, com.sharechef.app).
//
// SECURITY: a URL is attacker-controlled input — any app, web page, or QR code
// can fire sharechef://… at us. So nothing from the URL is ever handed to the
// router. The URL only SELECTS one of the literals in DEEP_LINK_TARGETS below;
// anything unrecognised lands on the fallback. Query strings and fragments are
// dropped outright.

export const DEEP_LINK_SCHEME = 'sharechef'

// The single segment between the scheme and the path: sharechef://open/saved
export const DEEP_LINK_HOST = 'open'

// The only screens a link may open. Add an In-App Event screen here (and
// nowhere else) when one ships.
export const DEEP_LINK_TARGETS = ['/', '/saved', '/preferences', '/pricing'] as const

export type DeepLinkTarget = (typeof DEEP_LINK_TARGETS)[number]

// Where a ShareChef link with an unknown path goes.
export const DEEP_LINK_FALLBACK: DeepLinkTarget = '/'

function isTarget(path: string): path is DeepLinkTarget {
  return (DEEP_LINK_TARGETS as readonly string[]).includes(path)
}

/**
 * Resolve an incoming URL to the screen it should open.
 *
 * Returns null when the URL is not a ShareChef deep link at all (a different
 * scheme, junk, or the empty string the web/`getLaunchUrl()` shim hands back).
 * Null means "leave the user where they are" — it must never be coerced into a
 * navigation, or an unrelated link would yank people off the page they are on.
 *
 * Returns DEEP_LINK_FALLBACK when the link IS ours but names a path that is not
 * in DEEP_LINK_TARGETS.
 */
export function parseDeepLink(raw: unknown): DeepLinkTarget | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()

  // Scheme must be exactly ours. iOS echoes back whatever casing the sender
  // used, and URL schemes are case-insensitive, so compare lowercased.
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed)
  if (!scheme || scheme[1].toLowerCase() !== DEEP_LINK_SCHEME) return null

  // Drop the query and fragment before anything else: we never navigate to a
  // path or query taken from the URL.
  const afterScheme = trimmed.slice(scheme[0].length).split(/[?#]/)[0]

  // Tolerate sharechef://open/saved, sharechef:/open/saved and
  // sharechef:open/saved — iOS is not strict about the authority slashes.
  const segments = afterScheme.split('/').filter((s) => s.length > 0)

  // Bare "sharechef://" — treat as a plain launch.
  if (segments.length === 0) return DEEP_LINK_FALLBACK

  if (segments[0].toLowerCase() !== DEEP_LINK_HOST) return DEEP_LINK_FALLBACK

  // Nothing after the host ("sharechef://open") is the home screen.
  const path = `/${segments.slice(1).join('/').toLowerCase()}`

  return isTarget(path) ? path : DEEP_LINK_FALLBACK
}

/** The link to paste into App Store Connect for a given screen. */
export function deepLinkFor(target: DeepLinkTarget): string {
  return `${DEEP_LINK_SCHEME}://${DEEP_LINK_HOST}${target === '/' ? '' : target}`
}

// ── Wiring ───────────────────────────────────────────────────────────────────
// Kept out of the React hook so it can be driven by a fake plugin in tests —
// the hook below it is then a thin lifecycle wrapper with nothing to get wrong.

/** The slice of @capacitor/app we use. Structural, so tests need no plugin. */
export interface DeepLinkSource {
  addListener(
    eventName: 'appUrlOpen',
    listener: (event: { url: string }) => void,
  ): Promise<{ remove: () => void }>
  getLaunchUrl(): Promise<{ url: string } | undefined>
}

/**
 * Start routing deep links. Returns a cleanup that detaches the listener and
 * makes any still-pending plugin call a no-op.
 *
 * `claimLaunchUrl` guards the cold-start URL: it is called only once the URL is
 * actually in hand, and only a `true` answer consumes it. That ordering matters
 * — a React StrictMode remount must not burn the claim on a mount it then
 * throws away, or the link that opened the app would be silently dropped.
 */
export function startDeepLinkRouting(
  source: DeepLinkSource,
  navigate: (target: DeepLinkTarget) => void,
  claimLaunchUrl: () => boolean = () => true,
): () => void {
  let cancelled = false
  let removeListener: (() => void) | undefined

  const open = (url: string | null | undefined) => {
    if (cancelled) return
    const target = parseDeepLink(url)
    // null = not one of ours. Leave the user where they are.
    if (target) navigate(target)
  }

  // Links that arrive while the app is already running. On the web this
  // registers a listener that never fires, which is the desired no-op.
  source
    .addListener('appUrlOpen', (event) => open(event.url))
    .then((handle) => {
      if (cancelled) handle.remove()
      else removeListener = () => handle.remove()
    })
    .catch(() => {
      /* plugin unavailable (plain browser) — nothing to listen for */
    })

  // The link that COLD-STARTED the app: appUrlOpen fires before React mounts,
  // so this is the only way to see it.
  source
    .getLaunchUrl()
    .then((result) => {
      if (cancelled || !claimLaunchUrl()) return
      open(result?.url)
    })
    .catch(() => {
      /* no launch URL on this platform */
    })

  return () => {
    cancelled = true
    removeListener?.()
  }
}
