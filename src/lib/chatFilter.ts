// Settings -> "Filter bad words in chat": on by default. While on, chat
// messages (lobby lines and bubbles, market lines, the Mute / Report popup)
// are shown with bad words starred out. The word list and matching are the
// `obscenity` library's English dataset -- it also catches look-alike
// spellings (sh1t) without starring innocent words that contain one
// (Scunthorpe). Display only: what was said is unchanged, so a report
// carries the original. Kept on this device, like the mute list.

import { useSyncExternalStore } from 'react';
import {
  RegExpMatcher,
  TextCensor,
  asteriskCensorStrategy,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

const KEY = 'wom_chat_filter';
const listeners = new Set<() => void>();

let matcher: RegExpMatcher | null = null;
const censor = new TextCensor().setStrategy(asteriskCensorStrategy());

/** The text with its bad words starred out. */
export function censorText(text: string): string {
  matcher ??= new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
  const matches = matcher.getAllMatches(text);
  return matches.length ? censor.applyTo(text, matches) : text;
}

export function isChatFilterOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setChatFilterOn(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    return;
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function useChatFilterOn(): boolean {
  return useSyncExternalStore(subscribe, isChatFilterOn, () => true);
}

const asSaid = (text: string) => text;

/** How to show a chat message under the current setting -- the same
 *  function until the setting changes, so it can be a memo dependency. */
export function useChatText(): (text: string) => string {
  return useChatFilterOn() ? censorText : asSaid;
}
