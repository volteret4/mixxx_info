import React, { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMusician } from "../api.js";

// ── Palette ────────────────────────────────────────────────────────────────

const COLOR = {
  center:    "#6366f1",
  artist:    "#3b82f6",
  producer:  "#a855f7",
  engineer:  "#22d3ee",
  label:     "#f97316",
  d_artist:  "#93c5fd",  // Discogs-only artist
  d_label:   "#fdba74",  // Discogs-only label
};

const LEGEND = [
  { type: "artist",   label: "Artistas" },
  { type: "producer", label: "Productores" },
  { type: "engineer", label: "Ingenieros" },
  { type: "label",    label: "Sellos (biblioteca)" },
  { type: "d_artist", label: "Artistas (Discogs)" },
  { type: "d_label",  label: "Sellos (Discogs)" },
];

const NAVIGABLE = new Set(["artist", "producer", "engineer", "d_artist"]);

function trunc(s, n = 13) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function fmt(sec) {
  if (!sec) return null;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function coverUrl(song) {
  if (!song?.cover_art_path) return null;
  return `/covers/${song.cover_art_path.replace(/^covers\//, "")}`;
}

// ── Radial graph ──────────────────────────────────────────────────────────

function RadialGraph({ centerName, groups, onNavigate }) {
  const [hovered, setHovered] = useState(null);
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 700, h: 500 });

  useEffect(() => {
    function update() {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        setSize({ w: r.width, h: r.height });
      }
    }
    update();
    const obs = new ResizeObserver(update);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const { w, h } = size;
  const cx = w / 2;
  const cy = h / 2;

  // Build nodes + edges
  const nodes = [{ id: "center", label: centerName, type: "center", x: cx, y: cy }];
  const edges = [];

  const activeGroups = groups.filter(g => g.items.length > 0);
  const total = activeGroups.reduce((s, g) => s + g.items.length, 0);

  if (total > 0) {
    let angle = -Math.PI / 2;
    for (const group of activeGroups) {
      const sector = (group.items.length / total) * 2 * Math.PI;
      const r = group.radius;
      group.items.forEach((item, i) => {
        const a = angle + ((i + 0.5) / group.items.length) * sector;
        const id = `${group.type}:${item.name}`;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        nodes.push({ id, label: item.name, type: group.type, x, y, count: item.count, dashed: !!group.dashed });
        edges.push({ from: "center", to: id, type: group.type, dashed: !!group.dashed });
      });
      angle += sector;
    }
  }

  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} className="select-none absolute inset-0">
        {/* Edges */}
        {edges.map((e, i) => {
          const f = byId[e.from], t = byId[e.to];
          const hot = hovered === e.to;
          return (
            <line
              key={i}
              x1={f.x} y1={f.y} x2={t.x} y2={t.y}
              stroke={hot ? COLOR[e.type] : "#3f3f46"}
              strokeWidth={hot ? 1.8 : 0.7}
              strokeOpacity={hot ? 1 : 0.5}
              strokeDasharray={e.dashed ? "5,4" : undefined}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const isCenter = n.type === "center";
          const hot = hovered === n.id;
          const nav = NAVIGABLE.has(n.type);
          const color = COLOR[n.type] || "#6b7280";
          const r = isCenter ? 30 : Math.min(20, 9 + (n.count || 1) * 1.5);

          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              style={{ cursor: nav ? "pointer" : "default" }}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => nav && onNavigate(n.label)}
            >
              {/* Glow ring on hover */}
              {hot && <circle r={r + 6} fill={color} fillOpacity={0.15} />}

              <circle
                r={r}
                fill={color}
                fillOpacity={isCenter ? 0.95 : n.dashed ? 0.35 : hot ? 0.85 : 0.65}
                stroke={hot ? "#fff" : isCenter ? "#a5b4fc" : "none"}
                strokeWidth={hot ? 1.5 : 2}
              />

              {/* Center label inside circle */}
              {isCenter && (
                <text textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="white" fontWeight="700">
                  {trunc(n.label, 9)}
                </text>
              )}

              {/* Count badge inside non-center nodes if > 1 */}
              {!isCenter && (n.count || 0) > 1 && (
                <text textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="white" fontWeight="700">
                  {n.count}
                </text>
              )}

              {/* Label below circle */}
              {!isCenter && (
                <text
                  y={r + 12}
                  textAnchor="middle"
                  fontSize={9}
                  fill={hot ? "#e4e4e7" : "#71717a"}
                  className="pointer-events-none"
                >
                  {trunc(n.label, 13)}
                </text>
              )}
            </g>
          );
        })}

        {/* Legend */}
        {LEGEND.filter(l => activeGroups.some(g => g.type === l.type)).map((l, i) => (
          <g key={l.type} transform={`translate(12, ${12 + i * 16})`}>
            <circle r={5} fill={COLOR[l.type]} fillOpacity={0.75} />
            <text x={10} y={4} fontSize={9} fill="#71717a">{l.label}</text>
          </g>
        ))}

        {/* Empty state */}
        {total === 0 && (
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={13} fill="#52525b">
            Sin colaboraciones en la biblioteca
          </text>
        )}
      </svg>
    </div>
  );
}

// ── Song row ───────────────────────────────────────────────────────────────

function SongRow({ song, onPlay, currentSongId }) {
  const src = coverUrl(song);
  const playing = currentSongId === song.id;
  return (
    <div
      className={`flex items-center gap-2 p-1.5 rounded cursor-pointer group hover:bg-zinc-800/60 transition-colors ${playing ? "bg-zinc-800 ring-1 ring-indigo-500/30" : ""}`}
      onClick={() => onPlay(song)}
    >
      <div className="w-9 h-9 shrink-0 rounded overflow-hidden bg-zinc-800">
        {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-600">♪</div>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-200 truncate">{song.title || "Sin título"}</p>
        <p className="text-[10px] text-zinc-500 truncate">{song.artist}{song.album ? ` — ${song.album}` : ""}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {song.camelot && <span className="text-[10px] font-mono text-indigo-400">{song.camelot}</span>}
        {song.bpm && <span className="text-[10px] font-mono text-zinc-600">{Math.round(song.bpm)}</span>}
        {song.year && <span className="text-[10px] text-zinc-700">{song.year}</span>}
      </div>
    </div>
  );
}

function SongGroup({ title, songs, color, onPlay, currentSongId }) {
  const [open, setOpen] = useState(true);
  if (!songs?.length) return null;
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest mb-1.5 w-full text-left ${color}`}
      >
        <span>{open ? "▼" : "▶"}</span>
        <span>{title}</span>
        <span className="font-normal text-zinc-600">({songs.length})</span>
      </button>
      {open && songs.map(s => (
        <SongRow key={s.id} song={s} onPlay={onPlay} currentSongId={currentSongId} />
      ))}
    </div>
  );
}

// ── Discogs release card ───────────────────────────────────────────────────

function DiscogsCard({ release }) {
  return (
    <div className={`flex items-center gap-2.5 p-1.5 rounded group hover:bg-zinc-800/40 ${release.in_library ? "bg-indigo-900/15 ring-1 ring-indigo-700/20" : ""}`}>
      <div className="w-9 h-9 shrink-0 rounded overflow-hidden bg-zinc-800">
        {release.thumb
          ? <img src={release.thumb} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm">♪</div>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-zinc-200 truncate font-medium">{release.title}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {release.artist && release.role !== "Main" && (
            <span className="text-[10px] text-zinc-500 truncate max-w-[120px]">{release.artist}</span>
          )}
          {release.year && <span className="text-[10px] text-zinc-600">{release.year}</span>}
          {release.role && <span className="text-[10px] text-zinc-700 italic">{release.role}</span>}
          {release.format && <span className="text-[10px] text-zinc-700">{release.format}</span>}
          {release.in_library && <span className="text-[10px] text-indigo-400 font-semibold">✓</span>}
        </div>
      </div>
      <a
        href={`https://www.discogs.com/${release.type === "master" ? "master" : "release"}/${release.id}`}
        target="_blank"
        rel="noreferrer"
        className="text-[10px] text-zinc-700 hover:text-zinc-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={e => e.stopPropagation()}
      >↗</a>
    </div>
  );
}

// ── Right panel (tabbed) ───────────────────────────────────────────────────

function RightPanel({ data, onPlay, currentSong }) {
  const [tab, setTab] = useState("discogs");
  const [filter, setFilter] = useState("all");

  const lib = data.library;
  const totalLib = (lib.as_artist?.length || 0) + (lib.as_producer?.length || 0) +
                   (lib.as_engineer?.length || 0) + (lib.as_musician?.length || 0);

  let releases = data.discogs_releases || [];
  if (filter === "main")      releases = releases.filter(r => r.role === "Main");
  if (filter === "credits")   releases = releases.filter(r => r.role !== "Main");
  if (filter === "not_owned") releases = releases.filter(r => !r.in_library);

  // Group by role for "credits" view
  const byRole = {};
  releases.forEach(r => {
    const key = r.role || "Otro";
    if (!byRole[key]) byRole[key] = [];
    byRole[key].push(r);
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-zinc-800">
        {[["discogs", "Discogs"], ["library", `Biblioteca (${totalLib})`]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors
              ${tab === id ? "border-b-2 border-indigo-500 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Discogs tab */}
      {tab === "discogs" && (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          {data.discogs_artist ? (
            <>
              {/* Artist info */}
              <div className="flex items-center gap-2">
                {data.discogs_artist.cover_image && (
                  <img src={data.discogs_artist.cover_image} alt="" className="w-10 h-10 rounded-full object-cover border border-zinc-700 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-zinc-200 truncate">{data.discogs_artist.title}</p>
                  {data.discogs_artist.type && (
                    <p className="text-[10px] text-zinc-500">{data.discogs_artist.type}</p>
                  )}
                </div>
                <a
                  href={`https://www.discogs.com/artist/${data.discogs_artist.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-zinc-600 hover:text-zinc-400 ml-auto shrink-0"
                >Perfil ↗</a>
              </div>

              {/* Filter */}
              <div className="flex gap-1 flex-wrap">
                {[["all","Todos"], ["main","Como artista"], ["credits","Como crédito"], ["not_owned","No tengo"]].map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setFilter(v)}
                    className={`text-[10px] px-2 py-0.5 rounded transition-colors
                      ${filter === v ? "bg-zinc-600 text-zinc-100" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>

              <p className="text-[10px] text-zinc-600">{releases.length} releases</p>

              <div className="flex flex-col gap-0.5">
                {releases.length > 0 ? releases.map((r, i) => (
                  <DiscogsCard key={`${r.id}-${i}`} release={r} />
                )) : (
                  <p className="text-xs text-zinc-600">Sin resultados con este filtro.</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2 pt-4">
              <p className="text-sm text-zinc-500 text-center">
                {data.discogs_error || "No encontrado en Discogs"}
              </p>
              <p className="text-xs text-zinc-600 text-center">
                Usa la pestaña Biblioteca para ver colaboraciones en tu colección.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Library tab */}
      {tab === "library" && (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-5">
          {totalLib === 0 ? (
            <p className="text-sm text-zinc-600 text-center pt-4">Sin canciones en la biblioteca.</p>
          ) : (
            <>
              <SongGroup title="Como artista"     songs={lib.as_artist}   color="text-indigo-400" onPlay={onPlay} currentSongId={currentSong?.id} />
              <SongGroup title="Como productor"   songs={lib.as_producer} color="text-violet-400" onPlay={onPlay} currentSongId={currentSong?.id} />
              <SongGroup title="Como ingeniero"   songs={lib.as_engineer} color="text-cyan-400"   onPlay={onPlay} currentSongId={currentSong?.id} />
              <SongGroup title="Como músico"      songs={lib.as_musician} color="text-amber-400"  onPlay={onPlay} currentSongId={currentSong?.id} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function MusicianPage({ name, onBack, onPlay, currentSong, onMusicianClick }) {
  const { data, isLoading } = useQuery({
    queryKey: ["musician", name],
    queryFn: () => fetchMusician(name),
    enabled: !!name,
  });

  const lib = data?.library || {};
  const collab = data?.collaborators || {};
  const totalLib = (lib.as_artist?.length || 0) + (lib.as_producer?.length || 0) +
                   (lib.as_engineer?.length || 0) + (lib.as_musician?.length || 0);

  const roles = [
    lib.as_artist?.length   > 0 && "Artista",
    lib.as_producer?.length > 0 && "Productor",
    lib.as_engineer?.length > 0 && "Ingeniero",
    lib.as_musician?.length > 0 && "Músico",
  ].filter(Boolean);

  // Build graph groups — inner ring (library), outer ring (Discogs)
  const groups = [
    { type: "artist",   label: "Artistas",            items: collab.artists   || [], radius: 170 },
    { type: "producer", label: "Productores",          items: collab.producers || [], radius: 185 },
    { type: "engineer", label: "Ingenieros",           items: collab.engineers || [], radius: 185 },
    { type: "label",    label: "Sellos",               items: collab.labels    || [], radius: 220 },
    { type: "d_artist", label: "Artistas (Discogs)",   items: data?.discogs_collab_artists || [], radius: 250, dashed: true },
    { type: "d_label",  label: "Sellos (Discogs)",     items: data?.discogs_collab_labels  || [], radius: 270, dashed: true },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <button onClick={onBack} className="text-zinc-400 hover:text-zinc-100 text-sm shrink-0">← Volver</button>
        <span className="text-base">👤</span>
        <h1 className="font-semibold text-zinc-100 truncate">{name}</h1>
        <div className="flex gap-1.5 shrink-0">
          {roles.map(r => (
            <span key={r} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">{r}</span>
          ))}
        </div>
        <span className="ml-auto text-xs text-zinc-600 shrink-0">{totalLib} canciones en biblioteca</span>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center flex-1 text-zinc-600 text-sm">Buscando colaboraciones…</div>
      )}

      {data && (
        <div className="flex flex-1 min-h-0">
          {/* Left: concept map */}
          <div className="flex-1 min-w-0 overflow-hidden p-2 flex flex-col gap-2">
            <p className="text-[10px] text-zinc-600 px-2">
              Haz clic en un nodo para explorar ese músico · los nodos sólidos son de tu biblioteca · punteados de Discogs
            </p>
            <div className="flex-1 min-h-0">
              <RadialGraph
                centerName={name}
                groups={groups}
                onNavigate={onMusicianClick}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="w-px bg-zinc-800 shrink-0" />

          {/* Right: tabbed panel */}
          <div className="w-88 shrink-0 overflow-hidden flex flex-col" style={{ width: "22rem" }}>
            <RightPanel data={data} onPlay={onPlay} currentSong={currentSong} />
          </div>
        </div>
      )}
    </div>
  );
}
