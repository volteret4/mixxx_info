import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  fetchPlaylists,
  fetchPlaylist,
  createPlaylist,
  deletePlaylist,
  removeTrackFromPlaylist,
  reorderPlaylistTracks,
  exportM3U,
} from "../api.js";

function SortableRow({ track, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 py-1 px-2 border-t border-zinc-800 hover:bg-zinc-800/50 group text-xs"
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab text-zinc-600 hover:text-zinc-400 select-none"
      >
        ⠿
      </span>
      <span className="flex-1 min-w-0 truncate text-zinc-200">
        {track.artist} — {track.title}
      </span>
      {track.camelot && (
        <span className="text-zinc-500 font-mono">{track.camelot}</span>
      )}
      {track.bpm && (
        <span className="text-zinc-500 font-mono">{track.bpm.toFixed(0)}</span>
      )}
      <button
        onClick={() => onRemove(track.id)}
        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400"
      >
        ✕
      </button>
    </div>
  );
}

export default function PlaylistPanel({ pendingTrack, onClearPending, mobileOpen, onClose }) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState(null);
  const [newName, setNewName] = useState("");

  const { data: playlists = [] } = useQuery({
    queryKey: ["playlists"],
    queryFn: fetchPlaylists,
  });

  const { data: active } = useQuery({
    queryKey: ["playlist", activeId],
    queryFn: () => fetchPlaylist(activeId),
    enabled: !!activeId,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const pl = await createPlaylist(newName.trim());
    setNewName("");
    setActiveId(pl.id);
    qc.invalidateQueries(["playlists"]);
  }

  async function handleDelete(id) {
    await deletePlaylist(id);
    if (activeId === id) setActiveId(null);
    qc.invalidateQueries(["playlists"]);
  }

  async function handleRemoveTrack(songId) {
    await removeTrackFromPlaylist(activeId, songId);
    qc.invalidateQueries(["playlist", activeId]);
    qc.invalidateQueries(["playlists"]);
  }

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id || !active?.tracks) return;
    const tracks = active?.tracks ?? [];
    const oldIdx = tracks.findIndex((t) => t.id === active.id);
    const newIdx = tracks.findIndex((t) => t.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(tracks, oldIdx, newIdx);
    await reorderPlaylistTracks(activeId, reordered.map((t) => t.id));
    qc.invalidateQueries(["playlist", activeId]);
  }

  // Receive pending track from TrackTable
  React.useEffect(() => {
    if (!pendingTrack || !activeId) return;
    import("../api.js").then(({ addTrackToPlaylist }) =>
      addTrackToPlaylist(activeId, pendingTrack.id).then(() => {
        qc.invalidateQueries(["playlist", activeId]);
        qc.invalidateQueries(["playlists"]);
        onClearPending();
      })
    );
  }, [pendingTrack]);

  const tracks = active?.tracks ?? [];

  return (
    <>
      {/* Backdrop (mobile drawer only) */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed md:static inset-y-0 right-0 z-50 md:z-auto
          w-72 max-w-[85vw] shrink-0 flex flex-col border-l border-zinc-800 bg-zinc-950 md:bg-transparent overflow-hidden
          transition-transform duration-200 md:transition-none
          ${mobileOpen ? "translate-x-0" : "translate-x-full"} md:translate-x-0`}
      >
      {/* Playlist list */}
      <div className="px-3 pt-3 pb-2 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-zinc-300 uppercase tracking-wider text-xs">
            Playlists
          </h2>
          <button onClick={onClose} className="md:hidden text-zinc-400 hover:text-zinc-100 text-base leading-none">✕</button>
        </div>
        <div className="flex flex-col gap-0.5 max-h-36 overflow-y-auto">
          {playlists.map((pl) => (
            <div
              key={pl.id}
              className={`flex items-center gap-1 px-1.5 py-1 rounded cursor-pointer text-xs ${
                activeId === pl.id
                  ? "bg-indigo-700 text-white"
                  : "hover:bg-zinc-800 text-zinc-300"
              }`}
              onClick={() => setActiveId(pl.id)}
            >
              <span className="flex-1 truncate">{pl.name}</span>
              <span className="text-zinc-500">{pl.track_count}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(pl.id); }}
                className="text-zinc-600 hover:text-red-400"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={handleCreate} className="flex gap-1 mt-2">
          <input
            className="flex-1 bg-zinc-800 rounded px-2 py-1 text-zinc-100 placeholder-zinc-500 text-xs focus:outline-none"
            placeholder="Nueva playlist…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            type="submit"
            className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs"
          >
            +
          </button>
        </form>
      </div>

      {/* Active playlist tracks */}
      {activeId && (
        <>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 text-xs">
            <span className="text-zinc-300 font-medium flex-1 truncate">{active?.name}</span>
            <span className="text-zinc-500">{tracks.length} pistas</span>
            <button
              onClick={() => exportM3U(activeId)}
              className="px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
              title="Exportar M3U"
            >
              ↓ M3U
            </button>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => {
              const { active: a, over: o } = e;
              if (!o || a.id === o.id) return;
              const oldIdx = tracks.findIndex((t) => t.id === a.id);
              const newIdx = tracks.findIndex((t) => t.id === o.id);
              if (oldIdx === -1 || newIdx === -1) return;
              const reordered = arrayMove(tracks, oldIdx, newIdx);
              reorderPlaylistTracks(activeId, reordered.map((t) => t.id)).then(() => {
                qc.invalidateQueries(["playlist", activeId]);
              });
            }}
          >
            <SortableContext items={tracks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="flex-1 overflow-y-auto">
                {tracks.map((t) => (
                  <SortableRow key={t.id} track={t} onRemove={handleRemoveTrack} />
                ))}
                {tracks.length === 0 && (
                  <p className="text-zinc-600 text-xs p-3">
                    Añade pistas con el botón +
                  </p>
                )}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      {!activeId && (
        <p className="text-zinc-600 text-xs p-3">Selecciona o crea una playlist</p>
      )}
      </aside>
    </>
  );
}
