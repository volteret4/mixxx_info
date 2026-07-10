import React, { useRef, useState, useEffect } from "react";
import { fetchAirsonicMatch, playAirsonicJukebox } from "../api";

function fmtTime(secs) {
  if (!secs || isNaN(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PlayerBar({ song, onClose }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [airsonicMenuOpen, setAirsonicMenuOpen] = useState(false);
  const [airsonicBusy, setAirsonicBusy] = useState(false);

  // New song → load and autoplay
  useEffect(() => {
    if (!song || !audioRef.current) return;
    audioRef.current.load();
    audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    setCurrentTime(0);
  }, [song?.id]);

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play();
      setPlaying(true);
    }
  }

  function handleSeekChange(e) {
    setCurrentTime(parseFloat(e.target.value));
  }

  function handleSeekCommit(e) {
    const t = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    setDragging(false);
  }

  function handleVolume(e) {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  }

  async function handleAirsonicJukebox() {
    setAirsonicMenuOpen(false);
    setAirsonicBusy(true);
    try {
      await playAirsonicJukebox(song.id);
    } catch (err) {
      alert("No se pudo reproducir en Airsonic: " + err.message);
    } finally {
      setAirsonicBusy(false);
    }
  }

  async function handleAirsonicOpen() {
    setAirsonicMenuOpen(false);
    setAirsonicBusy(true);
    try {
      const match = await fetchAirsonicMatch(song.id);
      window.open(match.web_url, "_blank");
    } catch (err) {
      alert("No se encontró en Airsonic: " + err.message);
    } finally {
      setAirsonicBusy(false);
    }
  }

  async function handleAirsonicCopyUrl() {
    setAirsonicMenuOpen(false);
    setAirsonicBusy(true);
    try {
      const match = await fetchAirsonicMatch(song.id);
      await navigator.clipboard.writeText(match.stream_url);
    } catch (err) {
      alert("No se encontró en Airsonic: " + err.message);
    } finally {
      setAirsonicBusy(false);
    }
  }

  if (!song) return null;

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="h-16 shrink-0 flex items-center gap-2 sm:gap-3 px-2 sm:px-4 border-t border-zinc-800 bg-zinc-900">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={`/api/stream/${song.id}`}
        onTimeUpdate={(e) => { if (!dragging) setCurrentTime(e.target.currentTime); }}
        onLoadedMetadata={(e) => setDuration(e.target.duration)}
        onEnded={() => setPlaying(false)}
        preload="auto"
      />

      {/* Cover */}
      {song.cover_art_path ? (
        <img
          src={`/covers/${song.cover_art_path.replace(/^covers\//, "")}`}
          alt=""
          className="w-10 h-10 object-cover rounded shrink-0"
        />
      ) : (
        <div className="w-10 h-10 bg-zinc-800 rounded shrink-0" />
      )}

      {/* Artist / title */}
      <div className="min-w-0 w-24 sm:w-48 shrink-0">
        <p className="text-zinc-100 text-xs font-medium truncate">{song.title}</p>
        <p className="text-zinc-400 text-xs truncate">{song.artist}</p>
      </div>

      {/* Play/pause */}
      <button
        onClick={togglePlay}
        className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center text-base shrink-0"
      >
        {playing ? "⏸" : "▶"}
      </button>

      {/* Airsonic (jukebox) — el contenedor no tiene acceso a los archivos
          reales, así que el <audio> de arriba casi nunca funciona en un
          despliegue en servidor; esto reproduce/abre/copia vía Airsonic. */}
      <div className="relative shrink-0">
        <button
          onClick={() => setAirsonicMenuOpen((v) => !v)}
          disabled={airsonicBusy}
          className="w-9 h-9 rounded-full bg-zinc-700 hover:bg-zinc-600 text-white flex items-center justify-center text-sm shrink-0 disabled:opacity-50"
          title="Reproducir vía Airsonic"
        >
          {airsonicBusy ? "…" : "📡"}
        </button>
        {airsonicMenuOpen && (
          <div className="absolute bottom-full mb-2 left-0 w-48 sm:w-56 max-w-[80vw] bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg overflow-hidden z-10 text-xs">
            <button
              onClick={handleAirsonicJukebox}
              className="w-full text-left px-3 py-2 text-zinc-100 hover:bg-zinc-700"
            >
              ▶ Reproducir en Airsonic (jukebox)
            </button>
            <button
              onClick={handleAirsonicOpen}
              className="w-full text-left px-3 py-2 text-zinc-100 hover:bg-zinc-700"
            >
              ↗ Abrir en Airsonic
            </button>
            <button
              onClick={handleAirsonicCopyUrl}
              className="w-full text-left px-3 py-2 text-zinc-100 hover:bg-zinc-700"
            >
              ⧉ Copiar URL de streaming
            </button>
          </div>
        )}
      </div>

      {/* Seek slider */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
        <span className="text-zinc-500 text-xs w-8 sm:w-10 text-right shrink-0">{fmtTime(currentTime)}</span>
        <div className="relative flex-1 h-1.5 bg-zinc-700 rounded-full">
          <div
            className="absolute top-0 left-0 h-full bg-indigo-500 rounded-full pointer-events-none"
            style={{ width: `${progress}%` }}
          />
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.5}
            value={dragging ? currentTime : currentTime}
            onChange={handleSeekChange}
            onMouseDown={() => setDragging(true)}
            onMouseUp={handleSeekCommit}
            onTouchEnd={handleSeekCommit}
            className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
          />
        </div>
        <span className="text-zinc-500 text-xs w-8 sm:w-10 shrink-0">{fmtTime(duration)}</span>
      </div>

      {/* Volume */}
      <div className="hidden sm:flex items-center gap-1.5 shrink-0 w-24">
        <span className="text-zinc-500 text-xs">🔊</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={volume}
          onChange={handleVolume}
          className="flex-1 accent-indigo-500 h-1"
        />
      </div>

      {/* BPM / Key badge */}
      {(song.bpm || song.camelot) && (
        <div className="text-xs text-zinc-400 shrink-0 text-right hidden lg:block">
          {song.bpm && <div className="font-mono">{song.bpm.toFixed(1)} BPM</div>}
          {song.camelot && <div className="font-mono">{song.camelot}</div>}
        </div>
      )}

      {/* Close */}
      <button
        onClick={onClose}
        className="text-zinc-600 hover:text-zinc-400 shrink-0"
        title="Cerrar reproductor"
      >
        ✕
      </button>
    </div>
  );
}
