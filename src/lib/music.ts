import { isMusicEnabled, subscribeSoundSettings } from './soundSettings';

export const HOME_MUSIC = '/audio/music/Broken by Water.mp3';
export const PRE_LOBBY_MUSIC = '/audio/music/Quiet Ascent.mp3';
export const BATTLE_MUSIC = '/audio/music/Chamber.mp3';

// A single shared <audio> element rather than one per screen -- screens
// mount/unmount their music via plain useEffects as the player navigates
// between the home screen, the lobby waiting room and an in-progress
// battle, so reusing one element lets a track change happen as a simple
// src swap instead of tearing down and restarting playback (and risking two
// tracks briefly overlapping).
let audio: HTMLAudioElement | null = null;
let currentTrack: string | null = null;

// Autoplay can be blocked before the player has interacted with the page at
// all, and jsdom (unit tests) doesn't implement play() at all -- it returns
// undefined instead of a Promise. Either way, a failure here is silent; the
// next toggle click or track change is what actually retries.
function safePlay(el: HTMLAudioElement): void {
  el.play()?.catch(() => {});
}

// Browsers block audio-with-sound from actually starting until the page has
// seen a real user gesture -- the very first playMusic() call happens from a
// mount effect, before any click, so it's silently rejected by that policy
// and playback just sits paused. It used to look like clicking the mute
// toggle "fixed" it, but that only worked because the click itself was the
// first qualifying gesture -- any click anywhere resumes it just as well, so
// retry once on the first one instead of requiring that specific button.
const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

function resumeOnFirstGesture(): void {
  GESTURE_EVENTS.forEach((evt) => document.removeEventListener(evt, resumeOnFirstGesture));
  if (audio && currentTrack && isMusicEnabled()) safePlay(audio);
}

function ensureAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!audio) {
    audio = new Audio();
    audio.loop = true;
    audio.volume = 0.4;
    subscribeSoundSettings(() => {
      if (!audio || !currentTrack) return;
      if (isMusicEnabled()) safePlay(audio);
      else audio.pause();
    });
    GESTURE_EVENTS.forEach((evt) => document.addEventListener(evt, resumeOnFirstGesture));
  }
  return audio;
}

/** Starts looping `track`. Safe to call every render -- a no-op if it's
 *  already the current track and playing. */
export function playMusic(track: string): void {
  const el = ensureAudio();
  if (!el) return;
  if (currentTrack !== track) {
    currentTrack = track;
    el.src = encodeURI(track);
  }
  if (isMusicEnabled()) safePlay(el);
}

export function stopMusic(): void {
  currentTrack = null;
  if (audio) audio.pause();
}
