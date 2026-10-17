'use client';

import LoadingState from '@/components/loading/LoadingState';

/**
 * The wait between the GREECE sword and standing in Athens -- rendered in
 * both halves of it so they read as one continuous loading screen:
 *
 *   1. the world map -> the route change and the city chunk downloading,
 *      during which the globe would otherwise sit there looking unclicked;
 *   2. the city page -> temple.glb, the Senate, the mountain and the Milky
 *      Way texture loading behind a `Suspense fallback={null}`.
 *
 * While it is up the game's loading overlay shows (<LoadingOverlay>: the
 * loading animation over grey); flip `done` once the scene is ready.
 */
export default function CityLoadingScreen({
  title,
  done = false,
}: {
  /** The city (or its action label), for screen readers. */
  title: string;
  done?: boolean;
}) {
  if (done) return null;
  return <LoadingState label={`Entering ${title}`} />;
}
