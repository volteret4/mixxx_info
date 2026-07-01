import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSongs, fetchFilterMeta, fetchSongDetail } from "../api.js";

const CAMELOT_KEYS = Array.from({ length: 12 }, (_, i) => [`${i + 1}A`, `${i + 1}B`]).flat();

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(seconds) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function hasFilters(f) {
  return !!(f.search || f.taste?.length || f.camelot || f.bpmMin || f.bpmMax || f.yearMin || f.yearMax || f.label);
}

// ── Cover card ─────────────────────────────────────────────────────────────

function CoverCard({ song, selected, onClick }) {
  const src = song.cover_art_path ? `/covers/${song.cover_art_path.replace(/^covers\//, "")}` : null;
  return (
    <div
      onClick={onClick}
      className={`relative cursor-pointer rounded-md overflow-hidden group transition-all
        ${selected ? "ring-2 ring-indigo-500 ring-offset-1 ring-offset-zinc-950" : "hover:ring-1 hover:ring-zinc-600 hover:ring-offset-1 hover:ring-offset-zinc-950"}`}
    >
      {src ? (
        <img src={src} alt="" className="w-full aspect-square object-cover" />
      ) : (
        <div className="w-full aspect-square bg-zinc-800 flex flex-col items-center justify-center p-2 gap-1">
          <span className="text-zinc-600 text-lg">♪</span>
          <span className="text-zinc-500 text-[10px] text-center leading-tight truncate w-full text-center">{song.artist}</span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
        <p className="text-white text-[11px] font-semibold leading-tight truncate">{song.title}</p>
        <p className="text-zinc-300 text-[10px] truncate">{song.artist}</p>
        {song.camelot && <p className="text-indigo-300 text-[10px] font-mono">{song.camelot} {song.bpm ? `· ${song.bpm.toFixed(0)} BPM` : ""}</p>}
      </div>
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────

function Row({ label, value, mono, color, href }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex gap-2 items-start text-xs">
      <span className="text-zinc-500 shrink-0 w-28">{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline truncate">{value}</a>
      ) : (
        <span className={`${color || "text-zinc-300"} ${mono ? "font-mono" : ""} break-words`}>{value}</span>
      )}
    </div>
  );
}

function Pills({ items, color = "bg-zinc-700 text-zinc-300", onMusicianClick }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((t, i) =>
        onMusicianClick ? (
          <button
            key={i}
            onClick={() => onMusicianClick(t)}
            className={`px-1.5 py-0.5 rounded text-[10px] ${color} hover:ring-1 hover:ring-white/20 cursor-pointer transition-all`}
          >
            {t}
          </button>
        ) : (
          <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] ${color}`}>{t}</span>
        )
      )}
    </div>
  );
}

function SampleList({ items, label }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <div className="flex flex-col gap-0.5">
        {items.map((s, i) => (
          <p key={i} className="text-xs text-zinc-400">
            <span className="text-zinc-300">{s.artist}</span>
            {s.title && <> — <span className="text-zinc-400 italic">{s.title}</span></>}
          </p>
        ))}
      </div>
    </div>
  );
}

function MetaSection({ title, children }) {
  return (
    <div className="border-t border-zinc-800 pt-3 mt-3 flex flex-col gap-2">
      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">{title}</p>
      {children}
    </div>
  );
}

function DetailPanel({ songId, onPlay, currentSongId, onMusicianClick }) {
  const { data: s, isLoading } = useQuery({
    queryKey: ["songDetail", songId],
    queryFn: () => fetchSongDetail(songId),
    enabled: !!songId,
  });

  if (!songId) return (
    <div className="flex items-center justify-center h-full text-zinc-600 text-sm text-center px-6">
      Selecciona una portada para ver los detalles
    </div>
  );

  if (isLoading) return (
    <div className="flex items-center justify-center h-full text-zinc-600 text-sm">Cargando…</div>
  );

  if (!s) return null;

  const isPlaying = currentSongId === s.id;
  const cover = s.cover_art_path ? `/covers/${s.cover_art_path.replace(/^covers\//, "")}` : null;

  return (
    <div className="flex flex-col gap-0 overflow-y-auto px-4 py-4">
      {/* Cover */}
      {cover && (
        <img src={cover} alt="" className="w-full rounded-md mb-4 object-cover" />
      )}

      {/* Play button */}
      <button
        onClick={() => onPlay(s)}
        className={`w-full py-1.5 rounded text-xs font-semibold mb-4 transition-colors
          ${isPlaying ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-200"}`}
      >
        {isPlaying ? "⏸ Reproduciendo" : "▶ Reproducir"}
      </button>

      {/* Core */}
      <div className="flex flex-col gap-2">
        <p className="text-base font-semibold text-zinc-100 leading-snug">{s.title || "Sin título"}</p>
        {s.artist && (
          <button
            onClick={() => onMusicianClick?.(s.artist)}
            className="text-sm text-zinc-400 hover:text-indigo-400 transition-colors text-left"
          >
            {s.artist}
          </button>
        )}
        <div className="flex gap-2 flex-wrap mt-1">
          {s.camelot && (
            <span className="px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 text-xs font-mono">{s.camelot}</span>
          )}
          {s.bpm && (
            <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-xs font-mono">{s.bpm.toFixed(1)} BPM</span>
          )}
          {s.year && (
            <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-xs">{s.year}</span>
          )}
          {s.folder_taste && (
            <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-500 text-xs">{s.folder_taste}</span>
          )}
        </div>
      </div>

      <MetaSection title="Release">
        <Row label="Álbum" value={s.album} />
        <Row label="Sello" value={s.label} />
        <Row label="Catálogo" value={s.catalog_number} mono />
        <Row label="Tipo" value={s.release_type} />
        <Row label="Estado" value={s.release_status} />
        <Row label="País" value={s.release_country} />
        <Row label="ISRC" value={s.isrc} mono />
      </MetaSection>

      <MetaSection title="Audio">
        <Row label="Duración" value={fmt(s.duration)} mono />
        <Row label="Key" value={s.key_signature} mono />
        <Row label="Sample rate" value={s.sample_rate ? `${s.sample_rate.toLocaleString()} Hz` : null} />
        <Row label="Bit depth" value={s.bit_depth ? `${s.bit_depth}-bit` : null} />
        <Row label="Canales" value={s.channels === 2 ? "Stereo" : s.channels === 1 ? "Mono" : s.channels} />
      </MetaSection>

      {(s.producers?.length > 0 || s.engineers?.length > 0 || s.session_musicians?.length > 0) && (
        <MetaSection title="Créditos">
          {s.producers?.length > 0 && (
            <div><p className="text-[10px] text-zinc-600 mb-0.5">Productores</p><Pills items={s.producers} color="bg-violet-900/50 text-violet-300" onMusicianClick={onMusicianClick} /></div>
          )}
          {s.engineers?.length > 0 && (
            <div><p className="text-[10px] text-zinc-600 mb-0.5">Ingenieros</p><Pills items={s.engineers} color="bg-zinc-700 text-zinc-300" onMusicianClick={onMusicianClick} /></div>
          )}
          {s.session_musicians?.length > 0 && (
            <div><p className="text-[10px] text-zinc-600 mb-0.5">Músicos</p><Pills items={s.session_musicians} color="bg-zinc-700 text-zinc-300" onMusicianClick={onMusicianClick} /></div>
          )}
        </MetaSection>
      )}

      {(s.samples?.length > 0 || s.sampled_by?.length > 0) && (
        <MetaSection title="Genealogía">
          <SampleList items={s.samples} label="Samples usados" />
          <SampleList items={s.sampled_by} label="Sampleado por" />
        </MetaSection>
      )}

      {(s.metacritic_score != null || s.aoty_score != null || s.lastfm_listeners != null) && (
        <MetaSection title="Puntuaciones">
          {s.metacritic_score != null && (
            <div className="flex flex-col gap-0.5">
              <Row label="Metacritic" value={s.metacritic_score} color="text-green-400" href={s.metacritic_url} />
              {s.metacritic_num_critics != null && (
                <Row label="" value={`${s.metacritic_positive || 0}+ / ${s.metacritic_mixed || 0}~ / ${s.metacritic_negative || 0}-  (${s.metacritic_num_critics} críticos)`} color="text-zinc-500" />
              )}
            </div>
          )}
          {s.aoty_score != null && (
            <Row label="AOTY" value={s.aoty_score} href={s.aoty_url} color="text-yellow-400" />
          )}
          {s.aoty_critic_score != null && s.aoty_critic_score !== s.aoty_score && (
            <Row label="AOTY crítico" value={s.aoty_critic_score} color="text-yellow-300" />
          )}
          {s.aoty_user_score != null && (
            <Row label="AOTY usuarios" value={s.aoty_user_score} color="text-yellow-200" />
          )}
          {s.lastfm_listeners != null && (
            <Row label="Last.fm" value={`${s.lastfm_listeners.toLocaleString()} oyentes`} color="text-orange-400" />
          )}
        </MetaSection>
      )}

      {s.review_links?.length > 0 && (
        <MetaSection title="Reseñas">
          {s.review_links.map((r, i) => (
            <a key={i} href={r.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:underline truncate block">
              {r.source || r.title || r.url}
            </a>
          ))}
        </MetaSection>
      )}

      {(s.youtube_url || s.bandcamp_url || s.artist_wikipedia_url || s.album_wikipedia_url) && (
        <MetaSection title="Links">
          {s.youtube_url && <Row label="YouTube" value="Ver vídeo" href={s.youtube_url} />}
          {s.bandcamp_url && <Row label="Bandcamp" value="Escuchar" href={s.bandcamp_url} />}
          {s.artist_wikipedia_url && <Row label="Wikipedia artista" value="Abrir" href={s.artist_wikipedia_url} />}
          {s.album_wikipedia_url && <Row label="Wikipedia álbum" value="Abrir" href={s.album_wikipedia_url} />}
        </MetaSection>
      )}

      {(s.custom_tags?.length > 0 || s.mb_tags?.length > 0 || s.artist_mb_tags?.length > 0) && (
        <MetaSection title="Tags">
          {s.custom_tags?.length > 0 && (
            <div><p className="text-[10px] text-zinc-600 mb-0.5">Custom</p><Pills items={s.custom_tags} color="bg-indigo-900/50 text-indigo-300" /></div>
          )}
          {s.mb_tags?.length > 0 && (
            <div><p className="text-[10px] text-zinc-600 mb-0.5">MusicBrainz</p><Pills items={s.mb_tags?.slice(0, 12)} /></div>
          )}
          {s.artist_mb_tags?.length > 0 && (
            <div><p className="text-[10px] text-zinc-600 mb-0.5">Artista MB</p><Pills items={s.artist_mb_tags?.slice(0, 12)} /></div>
          )}
        </MetaSection>
      )}

      {(s.artist_profile || s.artist_real_name || s.artist_aliases?.length > 0) && (
        <MetaSection title="Artista">
          {s.artist_real_name && <Row label="Nombre real" value={s.artist_real_name} />}
          {s.artist_aliases?.length > 0 && (
            <div><p className="text-[10px] text-zinc-600 mb-0.5">Alias</p><Pills items={s.artist_aliases} /></div>
          )}
          {s.artist_profile && (
            <p className="text-xs text-zinc-400 leading-relaxed line-clamp-6">{s.artist_profile}</p>
          )}
        </MetaSection>
      )}

      {s.artist_wikipedia_content && (
        <MetaSection title="Wikipedia">
          <p className="text-xs text-zinc-400 leading-relaxed line-clamp-8">{s.artist_wikipedia_content}</p>
        </MetaSection>
      )}

      {s.gemini_context && (
        <MetaSection title="Contexto AI">
          {(() => {
            try {
              const ctx = typeof s.gemini_context === "string" ? JSON.parse(s.gemini_context) : s.gemini_context;
              return (
                <div className="flex flex-col gap-2">
                  {ctx.historical_context && <p className="text-xs text-zinc-400 leading-relaxed">{ctx.historical_context}</p>}
                  {ctx.production_notes && <p className="text-xs text-zinc-500 leading-relaxed">{ctx.production_notes}</p>}
                </div>
              );
            } catch {
              return <p className="text-xs text-zinc-400">{s.gemini_context}</p>;
            }
          })()}
          {s.gemini_sources?.length > 0 && (
            <div className="flex flex-col gap-0.5 mt-1">
              {s.gemini_sources.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-500 hover:underline truncate">{u}</a>
              ))}
            </div>
          )}
        </MetaSection>
      )}

      {(s.musicbrainz_id || s.discogs_release_id) && (
        <MetaSection title="IDs externos">
          {s.musicbrainz_id && <Row label="MusicBrainz" value={s.musicbrainz_id} mono color="text-zinc-500" />}
          {s.discogs_release_id && <Row label="Discogs" value={s.discogs_release_id} mono color="text-zinc-500" />}
        </MetaSection>
      )}
    </div>
  );
}

// ── Left filter sidebar ───────────────────────────────────────────────────

function Sidebar({ filters, onChange, meta }) {
  function set(key, val) { onChange({ ...filters, [key]: val }); }

  function toggleTaste(t) {
    const cur = filters.taste || [];
    set("taste", cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]);
  }

  return (
    <aside className="w-52 shrink-0 flex flex-col gap-4 overflow-y-auto py-4 px-3 border-r border-zinc-800">
      {/* Search */}
      <input
        className="w-full bg-zinc-800 rounded px-2.5 py-1 text-zinc-100 placeholder-zinc-500 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-600"
        placeholder="Artista, título, álbum…"
        value={filters.search || ""}
        onChange={(e) => set("search", e.target.value)}
      />

      {/* Taste */}
      {meta?.tastes?.length > 0 && (
        <div>
          <p className="text-xs text-zinc-400 mb-1">Género</p>
          <div className="flex flex-col gap-0.5">
            {meta.tastes.map((t) => (
              <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(filters.taste || []).includes(t)}
                  onChange={() => toggleTaste(t)}
                  className="accent-indigo-500"
                />
                <span className="text-xs text-zinc-300">{t}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Label */}
      <div>
        <p className="text-xs text-zinc-400 mb-1">Sello</p>
        <input
          className="w-full bg-zinc-800 rounded px-2.5 py-1 text-zinc-100 placeholder-zinc-500 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-600"
          placeholder="Sello…"
          value={filters.label || ""}
          onChange={(e) => set("label", e.target.value)}
        />
      </div>

      {/* BPM */}
      <div>
        <p className="text-xs text-zinc-400 mb-1">BPM</p>
        <div className="flex items-center gap-1">
          <input
            type="number"
            className="w-full bg-zinc-800 rounded px-1.5 py-0.5 text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-600"
            placeholder="min"
            value={filters.bpmMin || ""}
            onChange={(e) => set("bpmMin", e.target.value ? parseFloat(e.target.value) : undefined)}
          />
          <span className="text-zinc-600 text-xs">–</span>
          <input
            type="number"
            className="w-full bg-zinc-800 rounded px-1.5 py-0.5 text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-600"
            placeholder="max"
            value={filters.bpmMax || ""}
            onChange={(e) => set("bpmMax", e.target.value ? parseFloat(e.target.value) : undefined)}
          />
        </div>
      </div>

      {/* Year */}
      <div>
        <p className="text-xs text-zinc-400 mb-1">Año</p>
        <div className="flex items-center gap-1">
          <input
            type="number"
            className="w-full bg-zinc-800 rounded px-1.5 py-0.5 text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-600"
            placeholder="desde"
            value={filters.yearMin || ""}
            onChange={(e) => set("yearMin", e.target.value ? parseInt(e.target.value) : undefined)}
          />
          <span className="text-zinc-600 text-xs">–</span>
          <input
            type="number"
            className="w-full bg-zinc-800 rounded px-1.5 py-0.5 text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-600"
            placeholder="hasta"
            value={filters.yearMax || ""}
            onChange={(e) => set("yearMax", e.target.value ? parseInt(e.target.value) : undefined)}
          />
        </div>
      </div>

      {/* Camelot */}
      <div>
        <p className="text-xs text-zinc-400 mb-1">
          Camelot{" "}
          {filters.camelot && (
            <button className="text-indigo-400 ml-1" onClick={() => set("camelot", "")}>✕</button>
          )}
        </p>
        <div className="grid grid-cols-2 gap-0.5">
          {CAMELOT_KEYS.map((k) => {
            const isB = k.endsWith("B");
            const sel = filters.camelot === k;
            return (
              <button
                key={k}
                onClick={() => set("camelot", sel ? "" : k)}
                className={`text-xs rounded py-0.5 font-mono ${
                  sel ? "bg-indigo-500 text-white"
                  : isB ? "bg-zinc-600 text-zinc-200 hover:bg-zinc-500"
                  : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                }`}
              >
                {k}
              </button>
            );
          })}
        </div>
        {filters.camelot && (
          <label className="flex items-center gap-1.5 mt-1 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={!!filters.compatible}
              onChange={(e) => set("compatible", e.target.checked)}
              className="accent-indigo-500"
            />
            Incluir compatibles
          </label>
        )}
      </div>

      {/* Sort */}
      <div>
        <p className="text-xs text-zinc-400 mb-1">Ordenar por</p>
        <select
          className="w-full bg-zinc-800 text-zinc-300 text-xs rounded px-2 py-1 focus:outline-none"
          value={`${filters.sort || "artist"}:${filters.sortDir || "asc"}`}
          onChange={(e) => {
            const [s, d] = e.target.value.split(":");
            onChange({ ...filters, sort: s, sortDir: d });
          }}
        >
          <option value="artist:asc">Artista A→Z</option>
          <option value="artist:desc">Artista Z→A</option>
          <option value="title:asc">Título A→Z</option>
          <option value="year:desc">Año (reciente)</option>
          <option value="year:asc">Año (antiguo)</option>
          <option value="bpm:asc">BPM ↑</option>
          <option value="bpm:desc">BPM ↓</option>
          <option value="lastfm:desc">Popularidad</option>
        </select>
      </div>

      <button
        className="mt-auto text-xs text-zinc-500 hover:text-zinc-300 underline"
        onClick={() => onChange({ sort: "artist", sortDir: "asc" })}
      >
        Limpiar filtros
      </button>
    </aside>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function CoversPage({ onBack, onPlay, currentSong, onMusicianClick }) {
  const [filters, setFilters] = useState({ sort: "artist", sortDir: "asc" });
  const [selectedId, setSelectedId] = useState(null);

  const { data: meta } = useQuery({ queryKey: ["filterMeta"], queryFn: fetchFilterMeta });

  const active = hasFilters(filters);
  const { data, isLoading } = useQuery({
    queryKey: ["covers-songs", filters],
    queryFn: () => fetchSongs({ ...filters, page: 1, perPage: 500 }),
    enabled: active,
    keepPreviousData: true,
  });

  const songs = data?.songs || [];

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <button onClick={onBack} className="text-zinc-400 hover:text-zinc-100 text-sm">← Volver</button>
        <h1 className="font-semibold text-zinc-200">🖼️ Portadas</h1>
        {data && (
          <span className="text-xs text-zinc-500">{data.total} canciones</span>
        )}
        {selectedId && (
          <button
            className="ml-auto text-xs text-zinc-500 hover:text-zinc-300"
            onClick={() => setSelectedId(null)}
          >
            Cerrar detalle ✕
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left filters */}
        <Sidebar filters={filters} onChange={setFilters} meta={meta} />

        {/* Cover grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {!active && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-600">
              <span className="text-4xl">🖼️</span>
              <p className="text-sm">Usa los filtros de la izquierda para explorar portadas</p>
            </div>
          )}
          {active && isLoading && (
            <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">Cargando…</div>
          )}
          {active && !isLoading && songs.length === 0 && (
            <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">Sin resultados</div>
          )}
          {songs.length > 0 && (
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
              {songs.map((song) => (
                <CoverCard
                  key={song.id}
                  song={song}
                  selected={selectedId === song.id}
                  onClick={() => setSelectedId(selectedId === song.id ? null : song.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right detail panel */}
        {selectedId && (
          <aside className="w-72 shrink-0 border-l border-zinc-800 overflow-hidden flex flex-col">
            <DetailPanel
              songId={selectedId}
              onPlay={onPlay}
              currentSongId={currentSong?.id}
              onMusicianClick={onMusicianClick}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
