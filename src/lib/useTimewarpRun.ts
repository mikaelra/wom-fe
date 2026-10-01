'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribe } from '@/lib/socket';
import { parseTimewarp, timewarpParamFor } from '@/lib/timewarpFx';
import type { TimewarpRun } from '@/lib/useTimewarpFx';

/**
 * Which timewarp animation to play, and when (lib/timewarpFx.ts) -- shared
 * by the globe and the city, so a timewarp plays wherever the player is
 * standing. lib/useTimewarpFx.ts then plays the `run` it returns.
 *
 * - `?timewarp` on its own is a preview, with controls to replay it
 *   (`preview`, `playPreview`, `playPreviewEnd`).
 * - `&play=1` is a player arriving from the inventory right after
 *   timewarping: it plays once, and `onArrival` takes the parameters off
 *   the URL.
 * - Anyone timewarping, anywhere: the server tells every client
 *   (`timewarp`), and the hour running out too (`timewarp_end`). The
 *   merchant poll is asked right away (`refreshMerchantOffer`), so the new
 *   moment's merchants and sky_date -- which the animation hands back to --
 *   are in before it ends.
 *
 * Read from window rather than useSearchParams, which would have to be
 * wrapped in a Suspense boundary.
 */
export function useTimewarpRun({
  onArrival,
  refreshMerchantOffer,
}: {
  onArrival: () => void;
  refreshMerchantOffer: () => void;
}): {
  preview: boolean;
  run: TimewarpRun | null;
  runId: number;
  playPreview: (value: string, momentTo?: string) => void;
  playPreviewEnd: (value: string, momentTo?: string) => void;
} {
  const [preview, setPreview] = useState(false);
  const [run, setRun] = useState<TimewarpRun | null>(null);
  const [runId, setRunId] = useState(0);
  // The moment of the last real timewarp this page played, so the player
  // who made it -- sent here with &play=1 -- doesn't see it again when the
  // server's broadcast of that same timewarp arrives.
  const lastTimewarpTo = useRef<number | null>(null);
  const lastTimewarpEnd = useRef<string | null>(null);
  // The latest callbacks, without resubscribing every render.
  const refresh = useRef(refreshMerchantOffer);
  refresh.current = refreshMerchantOffer;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const spec = parseTimewarp(params.get('timewarp'), params.get('to'));
    if (!spec) return;
    if (params.get('play')) {
      lastTimewarpTo.current = spec.to.getTime();
      setRun({ spec, from: 'sky', hold: false, markersHidden: true });
      onArrival();
    } else {
      setPreview(true);
      setRun({ spec, from: 'now', hold: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- read the arrival URL once

  useEffect(() => subscribe('timewarp', (payload) => {
    const spec = parseTimewarp(timewarpParamFor(payload.events), payload.revert_to_date);
    if (!spec || spec.to.getTime() === lastTimewarpTo.current) return;
    lastTimewarpTo.current = spec.to.getTime();
    setPreview(false);
    setRun({ spec, from: 'sky', hold: false });
    setRunId((n) => n + 1);
    refresh.current();
  }), []);

  // A timewarp's hour running out: the same animation in the same colours,
  // from the warped sky forward to now.
  useEffect(() => subscribe('timewarp_end', (payload) => {
    if (payload.ended_at === lastTimewarpEnd.current) return;
    lastTimewarpEnd.current = payload.ended_at;
    const spec = parseTimewarp(timewarpParamFor(payload.events), new Date().toISOString());
    if (!spec) return;
    setPreview(false);
    setRun({ spec, from: 'sky', hold: false, ending: true });
    setRunId((n) => n + 1);
    refresh.current();
  }), []);

  const playPreview = useCallback((value: string, momentTo?: string) => {
    const to = momentTo ?? new URLSearchParams(window.location.search).get('to');
    const spec = parseTimewarp(value, to);
    if (!spec) return;
    setRun({ spec, from: 'now', hold: true });
    setRunId((n) => n + 1);
  }, []);

  // A preview of a timewarp's hour running out: what `timewarp_end` plays,
  // from the moment warped to forward to now, handing the sky back to now.
  const playPreviewEnd = useCallback((value: string, momentTo?: string) => {
    const spec = parseTimewarp(value, new Date().toISOString());
    const from = parseTimewarp(value, momentTo ?? new URLSearchParams(window.location.search).get('to'));
    if (!spec || !from) return;
    setRun({ spec, from: from.to, hold: false, ending: true });
    setRunId((n) => n + 1);
  }, []);

  return { preview, run, runId, playPreview, playPreviewEnd };
}
