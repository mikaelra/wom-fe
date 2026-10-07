// What the app is waiting on right now, for the loading overlay
// (<LoadingOverlay>: the loading animation in the middle of the screen over
// a grey background):
//
//   - screens -- a page, scene or panel whose content isn't there yet renders
//     <LoadingState>, which claims the screen while mounted (shown at once);
//   - API calls -- every backend request goes through http.ts request(),
//     which brackets itself with beginRequest()/end (polls opt out);
//   - 3D assets -- a scene's <AssetLoadingReporter> mirrors three's loading
//     manager (models, textures) into setAssetsLoading(), with how much of
//     the scene has loaded so far (the overlay's grey fades with it).
//   API calls are "background" waits: the overlay only shows for them once
//   they last a moment (see useLoadingOverlay).
//
// A page can switch the overlay off entirely while it is mounted
// (<NoLoadingOverlay>, e.g. live lobbies, where it would get in the way).
//
// A plain module-level store (subscribe + snapshot) rather than React
// context, so request() can report without being a component.

let requests = 0;
let assetsLoading = false;
let suppressed = 0;
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

/** A scene's 3D assets started / stopped loading. */
export function setAssetsLoading(active: boolean): void {
  if (assetsLoading === active) return;
  assetsLoading = active;
  emit();
}

/** Switch the loading overlay off while the caller is mounted; returns the
 *  release. */
export function suppressLoadingOverlay(): () => void {
  suppressed += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    suppressed -= 1;
    emit();
  };
}

export function isOverlaySuppressed(): boolean {
  return suppressed > 0;
}

export function isAssetsLoading(): boolean {
  return assetsLoading;
}

/** A screen is waiting for its content; returns the release. */
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

/** True while an API call is in flight. */
export function isBackgroundLoading(): boolean {
  return requests > 0;
}

/** True while a <LoadingState> (a screen waiting for its content) is up. */
export function isScreenLoading(): boolean {
  return screens > 0;
}

/** Test hook: forget all state. */
export function resetLoadingTracker(): void {
  requests = 0;
  assetsLoading = false;
  suppressed = 0;
  screens = 0;
  emit();
}
