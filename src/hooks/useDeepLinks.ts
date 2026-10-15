import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { App as CapacitorApp } from '@capacitor/app'
import { startDeepLinkRouting } from '../lib/deepLink'

// The launch URL belongs to the app process, not to a React mount: it must be
// acted on once and never again, or a remount would drag the user back off
// whatever screen they had walked to.
let launchUrlHandled = false
function claimLaunchUrl(): boolean {
  if (launchUrlHandled) return false
  launchUrlHandled = true
  return true
}

/**
 * Routes sharechef://open/<path> links to the matching screen — both links that
 * arrive while the app is running and the one that cold-started it.
 *
 * All the behaviour lives in startDeepLinkRouting (src/lib/deepLink.ts), which
 * is covered by tests/deep-link.test.mjs. This is only the lifecycle glue.
 *
 * Auth is deliberately untouched: a link to a protected screen navigates there
 * and ProtectedRoute does whatever it already does for a signed-out visitor.
 */
export function useDeepLinks(): void {
  const navigate = useNavigate()

  // Kept in a ref so the subscription is created exactly once. react-router can
  // hand back a fresh `navigate` identity, and re-running the effect would
  // re-read the launch URL on every navigation.
  const navigateRef = useRef(navigate)
  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  useEffect(
    () => startDeepLinkRouting(CapacitorApp, (target) => navigateRef.current(target), claimLaunchUrl),
    [],
  )
}
