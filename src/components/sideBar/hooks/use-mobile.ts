import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

// matchMedia is an external store, so useSyncExternalStore is the primitive for
// it. The previous version subscribed in an effect and then called setState
// synchronously to seed the value — the cascading-render pattern the lint rule
// flags. This also removes the one-frame flash of the desktop layout, because
// the first render already reads the real width.
function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener("change", onStoreChange)
  return () => mql.removeEventListener("change", onStoreChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  )
}
