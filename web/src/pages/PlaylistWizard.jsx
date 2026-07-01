import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Dial from "../components/Dial.jsx";
import PlayerBar from "../components/PlayerBar.jsx";
import {
  fetchFilterMeta,
  fetchSuggestions,
  fetchPlaylists,
  fetchPlaylist,
  createPlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  searchSongs,
} from "../api.js";

// ── Song card used in flow columns ────────────────────────────────────────────

function coverSrc(song) {
  if (!song.cover_art_path) return null;
  return `/covers/${song.cover_art_path.replace(/^covers\//, "")}`;
}

function bpmBadge(bpm) {
  if (!bpm) return null;
  return (
    <span className="font-mono text-[10px] text-yellow-300">{bpm.toFixed(0)}</span>
  );
}

function keyBadge(camelot) {
  if (!camelot) return null;
  const m = camelot.match(/^(\d+)([AB])$/i);
  if (!m) return <span className="font-mono text-[10px] text-zinc-400">{camelot}</span>;
  const isB = m[2].toUpperCase() === "B";
  return (
    <span className={`font-mono text-[10px] font-semibold px-1 rounded ${isB ? "bg-indigo-700" : "bg-indigo-900"} text-white`}>
      {camelot}
    </span>
  );
}

function SongCard({ song, selected, onSelect, onAdd, onPlay, playing }) {
  const cover = coverSrc(song);
  const clickTimer = React.useRef(null);

  function handleClick() {
    if (clickTimer.current) {
      // double-click → add to playlist
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onAdd?.(song);
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        onPlay(song);   // single-click → play
        onSelect();     // also select (expand next column)
      }, 220);
    }
  }

  return (
    <div
      className={`group flex items-center gap-2 p-2 rounded cursor-pointer select-none border transition-colors ${
        selected
          ? "border-indigo-500 bg-indigo-950/60"
          : "border-transparent hover:border-zinc-600 hover:bg-zinc-800/50"
      }`}
      onClick={handleClick}
      title="Click: reproducir · Doble click: añadir a playlist"
    >
      {cover ? (
        <img src={cover} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
      ) : (
        <div className="w-8 h-8 bg-zinc-800 rounded shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-zinc-100 text-[11px] font-medium truncate">{song.title}</p>
        <p className="text-zinc-400 text-[10px] truncate">{song.artist}</p>
        <div className="flex items-center gap-1 mt-0.5">
          {bpmBadge(song.bpm)}
          {keyBadge(song.camelot || song.key_signature)}
        </div>
      </div>
      {onAdd && (
        <button
          onClick={(e) => { e.stopPropagation(); onAdd(song); }}
          className="w-6 h-6 rounded bg-indigo-700 hover:bg-indigo-600 text-white flex items-center justify-center text-xs shrink-0 opacity-0 group-hover:opacity-100"
          title="Añadir a playlist"
        >
          +
        </button>
      )}
    </div>
  );
}

// ── Flow column ───────────────────────────────────────────────────────────────

function FlowColumn({ label, songs, selectedId, onSelect, onAdd, onPlay, currentSong, loading, isSeed }) {
  return (
    <div className="flex flex-col w-52 shrink-0 h-full">
      <div className={`px-2 py-1 text-[11px] font-semibold uppercase tracking-wider rounded-t ${isSeed ? "text-amber-400 bg-amber-950/40" : "text-zinc-400 bg-zinc-800/60"}`}>
        {label}
        {songs.length > 0 && !isSeed && (
          <span className="ml-1 font-normal text-zinc-500">({songs.length})</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto border border-zinc-800 border-t-0 rounded-b p-1 flex flex-col gap-0.5 bg-zinc-900/30">
        {loading && <p className="text-zinc-600 text-xs p-2">Buscando…</p>}
        {!loading && songs.length === 0 && (
          <p className="text-zinc-700 text-xs p-2">
            {isSeed ? "Selecciona semilla →" : "Sin resultados"}
          </p>
        )}
        {songs.map((s) => (
          <SongCard
            key={s.id}
            song={s}
            selected={selectedId === s.id}
            onSelect={() => onSelect(s)}
            onAdd={onAdd}
            onPlay={onPlay}
            playing={currentSong?.id === s.id}
          />
        ))}
      </div>
    </div>
  );
}

// ── Seed search ───────────────────────────────────────────────────────────────

function SeedSearch({ tastes, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);

  function handleInput(e) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timerRef.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      const data = await searchSongs(q, tastes);
      setResults(data.songs || []);
      setOpen(true);
    }, 300);
  }

  function pick(song) {
    setQuery(`${song.artist} — ${song.title}`);
    setOpen(false);
    onSelect(song);
  }

  return (
    <div className="relative flex-1 max-w-xs">
      <input
        className="w-full bg-zinc-800 rounded px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        placeholder="🔍 Buscar semilla…"
        value={query}
        onChange={handleInput}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-50 max-h-64 overflow-y-auto">
          {results.map((s) => (
            <div
              key={s.id}
              className="px-3 py-1.5 hover:bg-zinc-700 cursor-pointer"
              onMouseDown={() => pick(s)}
            >
              <p className="text-zinc-100 text-xs font-medium">{s.title}</p>
              <p className="text-zinc-400 text-[10px]">{s.artist}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Right: playlist panel ─────────────────────────────────────────────────────

function WizardPlaylistPanel({ playlistId, setPlaylistId, onSelectSeed, currentSong, onPlay }) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const { data: playlists = [] } = useQuery({ queryKey: ["playlists"], queryFn: fetchPlaylists });
  const { data: playlist } = useQuery({
    queryKey: ["playlist", playlistId],
    queryFn: () => fetchPlaylist(playlistId),
    enabled: !!playlistId,
  });

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const pl = await createPlaylist(newName.trim());
    setNewName("");
    setPlaylistId(pl.id);
    qc.invalidateQueries(["playlists"]);
  }

  async function handleRemove(songId) {
    await removeTrackFromPlaylist(playlistId, songId);
    qc.invalidateQueries(["playlist", playlistId]);
  }

  const tracks = playlist?.tracks ?? [];

  return (
    <aside className="w-60 shrink-0 flex flex-col border-l border-zinc-800 bg-zinc-900/30">
      {/* Playlist selector */}
      <div className="px-3 pt-3 pb-2 border-b border-zinc-800">
        <p className="text-[11px] text-zinc-400 uppercase tracking-wider mb-1">Playlist</p>
        <select
          className="w-full bg-zinc-800 rounded px-2 py-1 text-zinc-100 text-xs mb-2"
          value={playlistId || ""}
          onChange={(e) => setPlaylistId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— Seleccionar —</option>
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.track_count})</option>
          ))}
        </select>
        <form onSubmit={handleCreate} className="flex gap-1">
          <input
            className="flex-1 bg-zinc-800 rounded px-2 py-0.5 text-zinc-100 placeholder-zinc-500 text-xs focus:outline-none"
            placeholder="Nueva playlist…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" className="px-2 rounded bg-indigo-700 hover:bg-indigo-600 text-white text-xs">+</button>
        </form>
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {!playlistId && (
          <p className="text-zinc-600 text-xs p-2">Selecciona o crea una playlist</p>
        )}
        {playlistId && tracks.length === 0 && (
          <p className="text-zinc-600 text-xs p-2">Añade pistas con el botón + del diagrama</p>
        )}
        {tracks.map((t, i) => (
          <div
            key={t.id}
            className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer hover:bg-zinc-800/50 group ${currentSong?.id === t.id ? "bg-indigo-950/40" : ""}`}
            onClick={() => onSelectSeed(t)}
            title="Click para usar como semilla del diagrama"
          >
            <span className="text-zinc-600 text-[10px] w-4 shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-zinc-200 text-[11px] truncate">{t.title}</p>
              <p className="text-zinc-500 text-[10px] truncate">{t.artist}</p>
            </div>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
              <button
                onClick={(e) => { e.stopPropagation(); onPlay(t); }}
                className="w-5 h-5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-[9px] flex items-center justify-center"
              >▶</button>
              <button
                onClick={(e) => { e.stopPropagation(); handleRemove(t.id); }}
                className="w-5 h-5 rounded hover:bg-red-900 text-zinc-500 hover:text-red-300 text-[10px] flex items-center justify-center"
              >✕</button>
            </div>
          </div>
        ))}
      </div>

      {tracks.length > 0 && (
        <div className="px-3 py-2 border-t border-zinc-800 text-[10px] text-zinc-500">
          {tracks.length} pistas · Click en una para usar como semilla
        </div>
      )}
    </aside>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export default function PlaylistWizard({ onBack }) {
  const qc = useQueryClient();

  // Settings
  const [tastes, setTastes] = useState([]);
  const [mode, setMode] = useState("bpm");
  const [delta, setDelta] = useState(5);
  const [steps, setSteps] = useState(3);

  // Flow state: columns[i] = { song, candidates: [], loading: false }
  // columns[0].song = seed, columns[0].candidates = step-1 options
  // columns[1].song = chosen at step 1, columns[1].candidates = step-2 options
  const [columns, setColumns] = useState([]);
  const [playlistId, setPlaylistId] = useState(null);
  const [currentSong, setCurrentSong] = useState(null);

  const { data: meta } = useQuery({ queryKey: ["filterMeta"], queryFn: fetchFilterMeta });

  function toggleTaste(t) {
    setTastes((cur) => cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]);
  }

  // Load suggestions for a given song and append/replace a column
  async function loadColumn(song, colIdx) {
    setColumns((prev) => {
      const next = prev.slice(0, colIdx + 1);
      next[colIdx] = { ...next[colIdx], song, candidates: [], loading: true };
      return next;
    });
    const cands = await fetchSuggestions({ songId: song.id, mode, delta, taste: tastes });
    setColumns((prev) => {
      const next = [...prev];
      if (next[colIdx]?.song?.id === song.id) {
        next[colIdx] = { song, candidates: cands, loading: false };
      }
      return next;
    });
  }

  // User selects a seed (from playlist click or search)
  async function selectSeed(song) {
    await loadColumn(song, 0);
  }

  // User clicks a candidate song in a column → expand next column
  async function selectCandidate(colIdx, song) {
    // colIdx is the column whose candidates are displayed; song is the candidate chosen
    const nextColIdx = colIdx + 1;
    if (nextColIdx > steps - 1) {
      // At max depth — just truncate to this level without expanding further
      setColumns((prev) => prev.slice(0, nextColIdx));
      return;
    }
    await loadColumn(song, nextColIdx);
  }

  // Add song to active playlist
  async function addToPlaylist(song) {
    if (!playlistId) return;
    await addTrackToPlaylist(playlistId, song.id);
    qc.invalidateQueries(["playlist", playlistId]);
    qc.invalidateQueries(["playlists"]);
  }

  // When mode/delta/tastes change while flow is open, refetch all columns
  const settingsKey = `${mode}:${delta}:${tastes.join(",")}`;
  const prevSettingsKey = useRef(settingsKey);
  const columnsRef = useRef(columns);
  useEffect(() => { columnsRef.current = columns; }, [columns]);

  useEffect(() => {
    if (prevSettingsKey.current === settingsKey) return;
    prevSettingsKey.current = settingsKey;
    const current = columnsRef.current;
    if (current.length === 0) return;
    // Refetch all columns in sequence
    (async () => {
      const refreshed = [];
      for (const col of current) {
        const cands = await fetchSuggestions({ songId: col.song.id, mode, delta, taste: tastes });
        refreshed.push({ song: col.song, candidates: cands, loading: false });
      }
      setColumns(refreshed);
    })();
  }, [settingsKey]); // eslint-disable-line

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-zinc-800 shrink-0 bg-zinc-900">
        <button
          onClick={onBack}
          className="text-zinc-400 hover:text-zinc-100 text-sm"
        >
          ← Volver
        </button>
        <h1 className="text-zinc-200 font-semibold">🧙 Playlist Wizard</h1>

        {/* Mode toggle + dials — in header for space efficiency */}
        <div className="flex items-center gap-4 ml-6">
          <div className="flex rounded overflow-hidden border border-zinc-700">
            <button
              className={`px-3 py-1 text-xs font-semibold transition-colors ${mode === "bpm" ? "bg-yellow-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
              onClick={() => setMode("bpm")}
            >
              BPM
            </button>
            <button
              className={`px-3 py-1 text-xs font-semibold transition-colors ${mode === "key" ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
              onClick={() => setMode("key")}
            >
              KEY
            </button>
          </div>
          <Dial
            label={mode === "bpm" ? "± BPM" : "Saltos"}
            value={delta}
            onChange={setDelta}
            min={1}
            max={mode === "bpm" ? 50 : 6}
          />
          <Dial label="Pasos" value={steps} onChange={setSteps} min={1} max={6} />
        </div>

        {/* Seed search */}
        <div className="ml-auto">
          <SeedSearch tastes={tastes} onSelect={selectSeed} />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Left: collections */}
        <aside className="w-44 shrink-0 flex flex-col gap-3 px-3 py-4 border-r border-zinc-800 overflow-y-auto">
          <p className="text-[11px] text-zinc-400 uppercase tracking-wider">Colecciones</p>
          {meta?.tastes?.map((t) => (
            <label key={t} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={tastes.includes(t)}
                onChange={() => toggleTaste(t)}
                className="accent-indigo-500"
              />
              <span className="text-zinc-300 text-xs">{t}</span>
            </label>
          ))}
          {!meta?.tastes?.length && (
            <p className="text-zinc-600 text-xs">Cargando…</p>
          )}
        </aside>

        {/* Center: flow diagram */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {columns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-700 gap-2">
              <span className="text-4xl">🧙</span>
              <p className="text-sm">Busca una canción semilla o haz click en una pista de la playlist</p>
            </div>
          ) : (
            <div className="flex-1 flex gap-0 overflow-x-auto p-4 items-start">
              {/* Seed column */}
              <FlowColumn
                label="Semilla"
                songs={[columns[0].song]}
                selectedId={columns[0].song.id}
                onSelect={() => {}}
                onAdd={addToPlaylist}
                onPlay={setCurrentSong}
                currentSong={currentSong}
                loading={false}
                isSeed
              />

              {/* Candidate columns */}
              {columns.map((col, i) => (
                <React.Fragment key={`${col.song.id}-${i}`}>
                  {/* Arrow connector */}
                  <div className="flex items-center px-1.5 shrink-0 self-stretch">
                    <div className="flex flex-col items-center h-full justify-center gap-1">
                      <div className="flex-1 w-px bg-zinc-800" />
                      <span className="text-zinc-600 text-lg">→</span>
                      <div className="flex-1 w-px bg-zinc-800" />
                    </div>
                  </div>

                  {/* This column's candidates */}
                  <FlowColumn
                    label={`Paso ${i + 1}`}
                    songs={col.candidates}
                    selectedId={columns[i + 1]?.song.id}
                    onSelect={(song) => selectCandidate(i, song)}
                    onAdd={addToPlaylist}
                    onPlay={setCurrentSong}
                    currentSong={currentSong}
                    loading={col.loading}
                    isSeed={false}
                  />
                </React.Fragment>
              ))}
            </div>
          )}
        </main>

        {/* Right: playlist */}
        <WizardPlaylistPanel
          playlistId={playlistId}
          setPlaylistId={setPlaylistId}
          onSelectSeed={selectSeed}
          currentSong={currentSong}
          onPlay={setCurrentSong}
        />
      </div>

      {/* Player bar */}
      <PlayerBar song={currentSong} onClose={() => setCurrentSong(null)} />
    </div>
  );
}
