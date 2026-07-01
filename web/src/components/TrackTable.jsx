import React from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSongs } from "../api.js";

const BPM_COLORS = [
  [100, "text-blue-400"],
  [120, "text-green-400"],
  [140, "text-yellow-400"],
  [160, "text-orange-400"],
  [999, "text-red-400"],
];

const CAMELOT_COLORS = [
  "#7f1d1d","#7c2d12","#78350f","#713f12",
  "#365314","#14532d","#134e4a","#164e63",
  "#0c4a6e","#1e3a5f","#312e81","#4a1d96",
];

function bpmColor(bpm) {
  if (!bpm) return "text-zinc-500";
  for (const [limit, cls] of BPM_COLORS) {
    if (bpm <= limit) return cls;
  }
  return "text-zinc-400";
}

function camelotBadge(camelot) {
  if (!camelot) return null;
  const m = camelot.match(/^(\d+)([AB])$/i);
  if (!m) return <span className="px-1 py-0.5 rounded text-xs bg-zinc-700">{camelot}</span>;
  const num = parseInt(m[1]);
  const letter = m[2].toUpperCase();
  const bg = CAMELOT_COLORS[(num - 1) % 12];
  const lightness = letter === "B" ? "cc" : "88";
  return (
    <span
      className="px-1.5 py-0.5 rounded text-xs font-mono font-semibold text-white"
      style={{ backgroundColor: bg + lightness }}
    >
      {camelot}
    </span>
  );
}

function fmtDur(secs) {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const COLUMNS = [
  { key: "artist",        label: "Artista", cls: "text-left px-2 py-1.5" },
  { key: "title",         label: "Título",  cls: "text-left px-2 py-1.5" },
  { key: "album",         label: "Álbum",   cls: "text-left px-2 py-1.5 hidden md:table-cell" },
  { key: "bpm",           label: "BPM",     cls: "text-right px-2 py-1.5 w-16" },
  { key: "key_signature", label: "Key",     cls: "text-center px-2 py-1.5 w-14" },
  { key: "duration",      label: "Dur",     cls: "text-right px-2 py-1.5 w-12 hidden md:table-cell" },
  { key: "year",          label: "Año",     cls: "text-right px-2 py-1.5 w-12 hidden lg:table-cell" },
];

function hasActiveFilters(f) {
  return !!(f.search || f.taste?.length || f.camelot || f.tag || f.bpmMin || f.bpmMax || f.yearMin || f.yearMax);
}

function SortHeader({ col, sort, sortDir, onSort }) {
  const active = sort === col.key;
  const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th
      className={`${col.cls} cursor-pointer select-none hover:text-zinc-200 ${active ? "text-indigo-400" : "text-zinc-400"} uppercase tracking-wide`}
      onClick={() => onSort(col.key)}
    >
      {col.label}{arrow}
    </th>
  );
}

export default function TrackTable({ filters, onFiltersChange, onAdd, onPlay, currentSong }) {
  const active = hasActiveFilters(filters);
  const clickTimer = React.useRef(null);
  const lastClickId = React.useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ["songs", filters],
    queryFn: () => fetchSongs({ ...filters, perPage: 500 }),
    enabled: active,
    keepPreviousData: true,
  });

  function handleSort(key) {
    const sameCol = filters.sort === key;
    onFiltersChange({
      ...filters,
      sort: key,
      sortDir: sameCol && filters.sortDir !== "desc" ? "desc" : "asc",
    });
  }

  function handleRowClick(song) {
    if (clickTimer.current && lastClickId.current === song.id) {
      // double-click: add to playlist
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      lastClickId.current = null;
      onAdd(song);
    } else {
      // first click: wait to confirm it's not a double-click
      clearTimeout(clickTimer.current);
      lastClickId.current = song.id;
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        lastClickId.current = null;
        onPlay(song);
      }, 220);
    }
  }

  const songs = data?.songs ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800 text-xs text-zinc-400 shrink-0">
        {active ? <span>{total} pistas</span> : <span className="text-zinc-600">— selecciona un género o busca —</span>}
      </div>

      {/* Table */}
      <div className="overflow-y-auto flex-1">
        {!active ? (
          <div className="flex items-center justify-center h-full text-zinc-700 text-sm select-none">
            Usa los filtros de la izquierda para ver pistas
          </div>
        ) : isLoading ? (
          <div className="text-zinc-500 p-4">Cargando…</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-zinc-900">
              <tr>
                <th className="w-8 px-1.5" />
                {COLUMNS.map((col) => (
                  <SortHeader
                    key={col.key}
                    col={col}
                    sort={filters.sort}
                    sortDir={filters.sortDir}
                    onSort={handleSort}
                  />
                ))}
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {songs.map((s) => {
                const playing = currentSong?.id === s.id;
                return (
                  <tr
                    key={s.id}
                    className={`border-t border-zinc-800 hover:bg-zinc-800/50 group cursor-pointer select-none ${playing ? "bg-indigo-950/40" : ""}`}
                    onClick={() => handleRowClick(s)}
                    title="Click: reproducir · Doble click: añadir a playlist"
                  >
                    <td className="px-1.5 py-1">
                      {s.cover_art_path ? (
                        <img
                          src={`/covers/${s.cover_art_path.replace(/^covers\//, "")}`}
                          alt=""
                          className="w-7 h-7 object-cover rounded"
                        />
                      ) : (
                        <div className="w-7 h-7 bg-zinc-800 rounded" />
                      )}
                    </td>
                    <td className="px-2 py-1 text-zinc-200 max-w-[10rem] truncate">{s.artist}</td>
                    <td className="px-2 py-1 text-zinc-100 font-medium max-w-[14rem] truncate">{s.title}</td>
                    <td className="px-2 py-1 text-zinc-400 max-w-[12rem] truncate hidden md:table-cell">{s.album}</td>
                    <td className={`px-2 py-1 text-right font-mono font-semibold ${bpmColor(s.bpm)}`}>
                      {s.bpm ? s.bpm.toFixed(1) : ""}
                    </td>
                    <td className="px-2 py-1 text-center">{camelotBadge(s.camelot || s.key_signature)}</td>
                    <td className="px-2 py-1 text-right text-zinc-500 hidden md:table-cell">{fmtDur(s.duration)}</td>
                    <td className="px-2 py-1 text-right text-zinc-500 hidden lg:table-cell">{s.year?.slice(0, 4)}</td>
                    <td className="px-1.5 py-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onAdd(s)}
                        className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center leading-none"
                        title="Añadir a playlist activa"
                      >
                        +
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
