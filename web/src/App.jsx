import React, { useState } from "react";
import FilterSidebar from "./components/FilterSidebar.jsx";
import TrackTable from "./components/TrackTable.jsx";
import PlaylistPanel from "./components/PlaylistPanel.jsx";
import PlayerBar from "./components/PlayerBar.jsx";
import PlaylistWizard from "./pages/PlaylistWizard.jsx";
import StatsPage from "./pages/StatsPage.jsx";
import CoversPage from "./pages/CoversPage.jsx";
import MusicianPage from "./pages/MusicianPage.jsx";

export default function App() {
  const [view, setView] = useState("library"); // "library" | "wizard" | "stats" | "covers" | "musician"
  const [prevView, setPrevView] = useState("library");
  const [musicianName, setMusicianName] = useState(null);
  const [filters, setFilters] = useState({ page: 1, perPage: 50, sort: "artist", sortDir: "asc" });
  const [pendingTrack, setPendingTrack] = useState(null);
  const [currentSong, setCurrentSong] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);

  function navigateToMusician(name) {
    setPrevView(view);
    setMusicianName(name);
    setView("musician");
  }

  function handlePlay(song) {
    setCurrentSong((prev) => (prev?.id === song.id ? null : song));
  }

  function setFilter(key, val) {
    setFilters((f) => ({ ...f, [key]: val, page: 1 }));
  }

  // Wizard is fully standalone (has its own player UI)
  if (view === "wizard") {
    return <PlaylistWizard onBack={() => setView("library")} />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {view === "library" && (
        <>
          {/* Top bar */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 px-3 py-1.5 border-b border-zinc-800 bg-zinc-900 shrink-0">
            <button
              onClick={() => setFilterOpen(true)}
              className="md:hidden shrink-0 w-7 h-7 rounded bg-zinc-700 hover:bg-zinc-600 text-white flex items-center justify-center text-sm"
              title="Filtros"
            >
              ☰
            </button>
            <input
              className="w-full sm:w-56 bg-zinc-800 rounded px-2.5 py-1 text-zinc-100 placeholder-zinc-500 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-600"
              placeholder="Artista, título, álbum, sello, tag…"
              value={filters.search || ""}
              onChange={(e) => setFilter("search", e.target.value)}
            />
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400">
              <span>BPM</span>
              <input
                type="number"
                className="w-14 bg-zinc-800 rounded px-1.5 py-0.5 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                placeholder="min"
                value={filters.bpmMin || ""}
                onChange={(e) => setFilter("bpmMin", e.target.value ? parseFloat(e.target.value) : undefined)}
              />
              <span className="text-zinc-600">–</span>
              <input
                type="number"
                className="w-14 bg-zinc-800 rounded px-1.5 py-0.5 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                placeholder="max"
                value={filters.bpmMax || ""}
                onChange={(e) => setFilter("bpmMax", e.target.value ? parseFloat(e.target.value) : undefined)}
              />
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400">
              <span>Año</span>
              <input
                type="number"
                className="w-16 bg-zinc-800 rounded px-1.5 py-0.5 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                placeholder="desde"
                value={filters.yearMin || ""}
                onChange={(e) => setFilter("yearMin", e.target.value ? parseInt(e.target.value) : undefined)}
              />
              <span className="text-zinc-600">–</span>
              <input
                type="number"
                className="w-16 bg-zinc-800 rounded px-1.5 py-0.5 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                placeholder="hasta"
                value={filters.yearMax || ""}
                onChange={(e) => setFilter("yearMax", e.target.value ? parseInt(e.target.value) : undefined)}
              />
            </div>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => setPlaylistOpen(true)}
                className="md:hidden shrink-0 w-7 h-7 rounded bg-indigo-700 hover:bg-indigo-600 text-white flex items-center justify-center text-sm"
                title="Playlists"
              >
                🎵
              </button>
              <button
                onClick={() => setView("covers")}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-semibold"
              >
                🖼️ <span className="hidden sm:inline">Portadas</span>
              </button>
              <button
                onClick={() => setView("stats")}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-semibold"
              >
                📊 <span className="hidden sm:inline">Estadísticas</span>
              </button>
              <button
                onClick={() => setView("wizard")}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-semibold"
              >
                🧙 <span className="hidden sm:inline">Playlist Wizard</span>
              </button>
            </div>
          </div>

          <div className="flex flex-1 min-h-0">
            <FilterSidebar
              filters={filters}
              onChange={setFilters}
              mobileOpen={filterOpen}
              onClose={() => setFilterOpen(false)}
            />
            <TrackTable
              filters={filters}
              onFiltersChange={setFilters}
              onAdd={(track) => setPendingTrack(track)}
              onPlay={handlePlay}
              currentSong={currentSong}
            />
            <PlaylistPanel
              pendingTrack={pendingTrack}
              onClearPending={() => setPendingTrack(null)}
              mobileOpen={playlistOpen}
              onClose={() => setPlaylistOpen(false)}
            />
          </div>
        </>
      )}

      {view === "stats" && (
        <StatsPage onBack={() => setView("library")} />
      )}

      {view === "covers" && (
        <CoversPage
          onBack={() => setView("library")}
          onPlay={handlePlay}
          currentSong={currentSong}
          onMusicianClick={navigateToMusician}
        />
      )}

      {view === "musician" && (
        <MusicianPage
          name={musicianName}
          onBack={() => setView(prevView)}
          onPlay={handlePlay}
          currentSong={currentSong}
          onMusicianClick={navigateToMusician}
        />
      )}

      <PlayerBar
        song={currentSong}
        onClose={() => setCurrentSong(null)}
      />
    </div>
  );
}
