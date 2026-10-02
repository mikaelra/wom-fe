// What the app is waiting on right now, for the global loading indicator
// (<GlobalLoadingIndicator>, the small loading mark in the corner):
//
//   - API calls -- every backend request goes through http.ts request(),
//     which brackets itself with beginRequest()/end;
//   - 3D assets -- a scene's <AssetLoadingReporter> mirrors three's loading
//     manager (models, textures) into setAssetsLoading();
//   - screens that already show a big loading mark (<LoadingScreen>) claim
//     the screen while mounted, so the corner mark never doubles up on one.
//
// A plain module-level store (subscribe + snapshot) rather than React
// context, so request() can report without being a component.

let requests = 0;
let assetsLoading = false;
let screens = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeLoading(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Marks one request as in flight; call the returned function when it
 *  settles (success or failure). Calling it more than once is harmless. */
export function beginRequest(): () => void {
  requests += 1;
  emit();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    requests -= 1;
    emit();
  };
}

export function requestsInFlight(): number {
  return requests;
}

export function setAssetsLoading(active: boolean): void {
  if (assetsLoading === active) return;
  assetsLoading = active;
  emit();
}

/** A full loading screen is showing; returns the release. */
export function claimLoadingScreen(): () => void {
  screens += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    screens -= 1;
    emit();
  };
}

/** True while something is loading that no loading screen already shows. */
export function isBackgroundLoading(): boolean {
  return (requests > 0 || assetsLoading) && screens === 0;
}

/** Test hook: forget all state. */
export function resetLoadingTracker(): void {
  requests = 0;
  assetsLoading = false;
  screens = 0;
  emit();
}
