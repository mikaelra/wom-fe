"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const SONG_MAP: Record<string, string> = {
  "/leaderboards": "/audio/music/Quiet Ascent.mp3",
  "/vault": "/audio/music/Chamber.mp3",
  "/rules": "/audio/music/Broken by Water.mp3",
};

function getSong(pathname: string): string {
  if (SONG_MAP[pathname]) return SONG_MAP[pathname];
  for (const key of Object.keys(SONG_MAP)) {
    if (pathname.startsWith(key + "/")) return SONG_MAP[key];
  }
  return "/audio/music/Main Theme.mp3";
}

export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const isPlayingRef = useRef(true);
  const pathname = usePathname();
  const songSrc = getSong(pathname);
  const prevSongRef = useRef(songSrc);

  // Initial autoplay
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.5;
    audio.loop = true;
    audio.play()
      .then(() => { isPlayingRef.current = true; })
      .catch(() => { isPlayingRef.current = false; });
  }, []);

  // Switch song on route change
  useEffect(() => {
    if (prevSongRef.current === songSrc) return;
    prevSongRef.current = songSrc;
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = songSrc;
    audio.load();
    if (isPlayingRef.current) {
      audio.play().catch(() => {});
    }
  }, [songSrc]);

  return <audio ref={audioRef} src={songSrc} />;
}
