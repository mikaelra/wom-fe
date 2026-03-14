"use client";

import { useEffect, useRef, useState } from "react";
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
  const [isPlaying, setIsPlaying] = useState(true);
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
      .then(() => { setIsPlaying(true); isPlayingRef.current = true; })
      .catch(() => { setIsPlaying(false); isPlayingRef.current = false; });
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

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
    } else {
      audio.play()
        .then(() => { setIsPlaying(true); isPlayingRef.current = true; })
        .catch(() => {});
    }
  };

  return (
    <>
      <audio ref={audioRef} src={songSrc} />
      <button
        onClick={toggle}
        title={isPlaying ? "Pause music" : "Play music"}
        style={{
          position: "fixed",
          top: "12px",
          left: "12px",
          zIndex: 9999,
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          background: "rgba(0,0,0,0.6)",
          border: "2px solid rgba(255,255,255,0.3)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          fontSize: "14px",
          backdropFilter: "blur(4px)",
        }}
      >
        {isPlaying ? "⏸" : "▶"}
      </button>
    </>
  );
}
