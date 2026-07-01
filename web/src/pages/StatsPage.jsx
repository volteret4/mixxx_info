import React, { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchStats, fetchFilterMeta, fetchSongs } from "../api.js";

// ── Primitive chart components ─────────────────────────────────────────────

/** Horizontal bar: label on left, filled bar, count on right */
function HBar({ label, value, max, color = "#6366f1", pct }) {
  const w = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-40 shrink-0 truncate text-zinc-400 text-right" title={label}>{label}</span>
      <div className="flex-1 bg-zinc-800 rounded-full h-2 min-w-0">
        <div className="h-2 rounded-full transition-all" style={{ width: `${w}%`, backgroundColor: color }} />
      </div>
      <span className="w-10 shrink-0 text-right text-zinc-300">{pct != null ? `${pct}%` : value}</span>
    </div>
  );
}

/** Vertical histogram bars */
function VBars({ data, xKey, yKey, colorFn, showEvery = 1, height = 100, tooltip }) {
  const max = Math.max(...data.map((d) => d[yKey]), 1);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-px" style={{ height }}>
        {data.map((d, i) => (
          <div
            key={i}
            className="flex-1 min-w-0 rounded-t cursor-default transition-opacity hover:opacity-80"
            style={{
              height: `${(d[yKey] / max) * 100}%`,
              backgroundColor: colorFn ? colorFn(d, i) : "#6366f1",
              minHeight: d[yKey] > 0 ? 2 : 0,
            }}
            title={`${d[xKey]}: ${d[yKey]}`}
          />
        ))}
      </div>
      <div className="flex gap-px overflow-hidden">
        {data.map((d, i) => (
          <div key={i} className="flex-1 min-w-0 text-center overflow-hidden">
            {i % showEvery === 0 ? (
              <span className="text-[9px] text-zinc-600 truncate block">{d[xKey]}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Section wrapper */
function Section({ title, children, cols = 1 }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">{title}</h3>
      <div className={`grid gap-4 ${cols === 2 ? "grid-cols-2" : "grid-cols-1"}`}>{children}</div>
    </div>
  );
}

/** Chart card */
function Card({ title, children, className = "" }) {
  return (
    <div className={`bg-zinc-900 border border-zinc-800 rounded-lg p-4 ${className}`}>
      <p className="text-xs text-zinc-400 font-semibold mb-3">{title}</p>
      {children}
    </div>
  );
}

/** Big summary stat */
function Stat({ label, value, sub, color = "text-zinc-100" }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-1">
      <span className={`text-2xl font-bold font-mono ${color}`}>{value}</span>
      <span className="text-xs text-zinc-400">{label}</span>
      {sub && <span className="text-[10px] text-zinc-600">{sub}</span>}
    </div>
  );
}

/** Tag cloud */
function TagCloud({ tags }) {
  const max = tags[0]?.count || 1;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map(({ tag, count }) => {
        const size = 10 + Math.round((count / max) * 6);
        const opacity = 0.5 + (count / max) * 0.5;
        return (
          <span
            key={tag}
            className="px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 cursor-default"
            style={{ fontSize: size, opacity }}
            title={`${count} canciones`}
          >
            {tag}
          </span>
        );
      })}
    </div>
  );
}

// ── Camelot colors ─────────────────────────────────────────────────────────

const CAMELOT_COLORS_HEX = [
  "#7f1d1d","#7c2d12","#78350f","#713f12","#365314","#14532d",
  "#134e4a","#164e63","#0c4a6e","#1e3a5f","#312e81","#4a1d96",
];

function camelotColor(key) {
  const m = key.match(/^(\d+)([AB])$/);
  if (!m) return "#6366f1";
  const n = parseInt(m[1]);
  const base = CAMELOT_COLORS_HEX[(n - 1) % 12];
  return m[2] === "B" ? base + "dd" : base + "99";
}

// ── Dropdown controls ──────────────────────────────────────────────────────

function MultiDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggle(opt) {
    onChange(value.includes(opt) ? value.filter((x) => x !== opt) : [...value, opt]);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-300"
      >
        {value.length === 0 ? label : `${label}: ${value.length}`}
        <span className="text-zinc-500">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded shadow-xl z-50 p-2 min-w-[180px] max-h-72 overflow-y-auto">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-1 py-0.5 cursor-pointer hover:bg-zinc-700 rounded">
              <input
                type="checkbox"
                checked={value.includes(opt)}
                onChange={() => toggle(opt)}
                className="accent-indigo-500"
              />
              <span className="text-xs text-zinc-300">{opt}</span>
            </label>
          ))}
          {value.length > 0 && (
            <button
              className="w-full mt-1 text-xs text-zinc-500 hover:text-zinc-300 text-left px-1"
              onClick={() => onChange([])}
            >
              ✕ Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

function fmt(seconds) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function StatsPage({ onBack }) {
  const [taste, setTaste] = useState([]);
  const [label, setLabel] = useState("");

  const { data: meta } = useQuery({ queryKey: ["filterMeta"], queryFn: fetchFilterMeta });
  const { data: stats, isLoading } = useQuery({
    queryKey: ["stats", taste, label],
    queryFn: () => fetchStats({ taste, label }),
  });

  const hasFilters = taste.length > 0 || !!label;
  const { data: songsData } = useQuery({
    queryKey: ["songs-for-stats", taste, label],
    queryFn: () => fetchSongs({ taste, label, sort: "artist", sortDir: "asc", page: 1, perPage: 500 }),
    enabled: hasFilters,
  });

  const labels = meta?.labels || [];
  const tastes = meta?.tastes || [];

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <button onClick={onBack} className="text-zinc-400 hover:text-zinc-100 text-sm">← Volver</button>
        <h1 className="font-semibold text-zinc-200">📊 Estadísticas</h1>
        <div className="flex items-center gap-2 ml-4">
          <MultiDropdown label="Género" options={tastes} value={taste} onChange={setTaste} />
          <select
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-300"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          >
            <option value="">Todos los sellos</option>
            {labels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          {(taste.length > 0 || label) && (
            <button
              className="text-xs text-zinc-500 hover:text-zinc-300"
              onClick={() => { setTaste([]); setLabel(""); }}
            >
              ✕ Limpiar filtros
            </button>
          )}
        </div>
        {stats && (
          <span className="ml-auto text-xs text-zinc-500">{stats.total} canciones</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <div className="flex items-center justify-center h-64 text-zinc-600">Calculando estadísticas…</div>
        )}
        {stats && stats.total > 0 && (
          <div className="flex flex-col gap-8 max-w-7xl mx-auto">

            {/* ── Summary cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <Stat label="Canciones" value={stats.total} color="text-indigo-400" />
              <Stat
                label="Con BPM"
                value={stats.coverage?.find(c => c.field === "BPM")?.count ?? "—"}
                sub={`${stats.coverage?.find(c => c.field === "BPM")?.pct ?? 0}%`}
                color="text-yellow-400"
              />
              <Stat
                label="Con Key"
                value={stats.coverage?.find(c => c.field === "Key")?.count ?? "—"}
                sub={`${stats.coverage?.find(c => c.field === "Key")?.pct ?? 0}%`}
                color="text-cyan-400"
              />
              <Stat
                label="Con cover"
                value={stats.coverage?.find(c => c.field === "Cover art")?.count ?? "—"}
                sub={`${stats.coverage?.find(c => c.field === "Cover art")?.pct ?? 0}%`}
                color="text-green-400"
              />
              <Stat
                label="Con productores"
                value={stats.coverage?.find(c => c.field === "Productores")?.count ?? "—"}
                sub={`${stats.coverage?.find(c => c.field === "Productores")?.pct ?? 0}%`}
                color="text-violet-400"
              />
              <Stat
                label="Con Metacritic"
                value={stats.coverage?.find(c => c.field === "Metacritic score")?.count ?? "—"}
                sub={`${stats.coverage?.find(c => c.field === "Metacritic score")?.pct ?? 0}%`}
                color="text-orange-400"
              />
            </div>

            {/* ── BPM + Key ── */}
            <Section title="Distribución técnica" cols={2}>
              <Card title="BPM (histograma, buckets de 5)">
                {stats.bpm_distribution?.length > 0 ? (
                  <VBars
                    data={stats.bpm_distribution}
                    xKey="bpm"
                    yKey="count"
                    colorFn={(d) => {
                      const b = d.bpm;
                      if (b < 100) return "#3b82f6";
                      if (b < 120) return "#22c55e";
                      if (b < 140) return "#eab308";
                      if (b < 160) return "#f97316";
                      return "#ef4444";
                    }}
                    showEvery={4}
                    height={120}
                  />
                ) : <p className="text-zinc-600 text-xs">Sin datos de BPM</p>}
              </Card>

              <Card title="Distribución de keys (Camelot)">
                {stats.key_distribution?.some(k => k.count > 0) ? (
                  <VBars
                    data={stats.key_distribution.filter(k => k.count > 0)}
                    xKey="key"
                    yKey="count"
                    colorFn={(d) => camelotColor(d.key)}
                    showEvery={1}
                    height={120}
                  />
                ) : <p className="text-zinc-600 text-xs">Sin datos de key</p>}
              </Card>
            </Section>

            {/* ── Year + Duration ── */}
            <Section title="Tiempo" cols={2}>
              <Card title="Canciones por año de lanzamiento">
                {stats.year_distribution?.length > 0 ? (
                  <VBars
                    data={stats.year_distribution}
                    xKey="year"
                    yKey="count"
                    colorFn={() => "#818cf8"}
                    showEvery={5}
                    height={100}
                  />
                ) : <p className="text-zinc-600 text-xs">Sin datos de año</p>}
              </Card>

              <Card title="Duración (por minuto)">
                {stats.duration_distribution?.length > 0 ? (
                  <VBars
                    data={stats.duration_distribution}
                    xKey="min"
                    yKey="count"
                    colorFn={(d) => d.min <= 4 ? "#22d3ee" : d.min <= 8 ? "#818cf8" : "#a78bfa"}
                    showEvery={1}
                    height={100}
                  />
                ) : <p className="text-zinc-600 text-xs">Sin datos de duración</p>}
              </Card>
            </Section>

            {/* ── Genre + Label ── */}
            <Section title="Colección" cols={2}>
              <Card title="Canciones por género / carpeta">
                <div className="flex flex-col gap-1.5">
                  {(stats.genre_distribution || []).map(({ taste, count }) => (
                    <HBar key={taste} label={taste} value={count} max={stats.genre_distribution[0]?.count || 1} color="#6366f1" />
                  ))}
                </div>
              </Card>

              <Card title="Top 30 sellos">
                <div className="flex flex-col gap-1.5">
                  {(stats.label_distribution || []).map(({ label, count }) => (
                    <HBar key={label} label={label} value={count} max={stats.label_distribution[0]?.count || 1} color="#22d3ee" />
                  ))}
                </div>
              </Card>
            </Section>

            {/* ── Artists + Producers ── */}
            <Section title="Créditos" cols={2}>
              <Card title="Top 25 artistas">
                <div className="flex flex-col gap-1.5">
                  {(stats.top_artists || []).map(({ artist, count }) => (
                    <HBar key={artist} label={artist} value={count} max={stats.top_artists[0]?.count || 1} color="#a78bfa" />
                  ))}
                </div>
              </Card>

              <Card title="Top 25 productores">
                {stats.top_producers?.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {stats.top_producers.map(({ name, count }) => (
                      <HBar key={name} label={name} value={count} max={stats.top_producers[0]?.count || 1} color="#f472b6" />
                    ))}
                  </div>
                ) : <p className="text-zinc-600 text-xs">Sin datos de productores enriquecidos</p>}
              </Card>
            </Section>

            {/* ── Tags ── */}
            <Section title="Tags" cols={2}>
              <Card title="Tags personalizados (custom_tags)">
                {stats.top_tags?.length > 0 ? (
                  <TagCloud tags={stats.top_tags} />
                ) : <p className="text-zinc-600 text-xs">Sin custom tags</p>}
              </Card>

              <Card title="Tags MusicBrainz (artista)">
                {stats.top_mb_tags?.length > 0 ? (
                  <TagCloud tags={stats.top_mb_tags} />
                ) : <p className="text-zinc-600 text-xs">Sin tags MB enriquecidos</p>}
              </Card>
            </Section>

            {/* ── Reviews + Listeners ── */}
            <Section title="Puntuaciones y popularidad" cols={2}>
              <Card title="Distribución Metacritic (buckets de 10)">
                {stats.metacritic_distribution?.length > 0 ? (
                  <VBars
                    data={stats.metacritic_distribution}
                    xKey="score"
                    yKey="count"
                    colorFn={(d) => d.score >= 80 ? "#22c55e" : d.score >= 60 ? "#eab308" : "#ef4444"}
                    showEvery={1}
                    height={100}
                  />
                ) : <p className="text-zinc-600 text-xs">Sin datos de Metacritic</p>}
              </Card>

              <Card title="Last.fm oyentes">
                {stats.lastfm_distribution?.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {stats.lastfm_distribution.map(({ bucket, count }) => (
                      <HBar key={bucket} label={bucket} value={count} max={Math.max(...stats.lastfm_distribution.map(d => d.count))} color="#fb923c" />
                    ))}
                  </div>
                ) : <p className="text-zinc-600 text-xs">Sin datos de Last.fm</p>}
              </Card>
            </Section>

            {/* ── Audio quality + Release metadata ── */}
            <Section title="Calidad de audio y metadatos de release" cols={2}>
              <Card title="Calidad de audio">
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <p className="text-zinc-500 mb-2">Sample rate (Hz)</p>
                    <div className="flex flex-col gap-1">
                      {(stats.sample_rate_distribution || []).map(({ rate, count }) => (
                        <div key={rate} className="flex justify-between text-zinc-300">
                          <span>{rate?.toLocaleString()}</span>
                          <span className="text-zinc-500">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-zinc-500 mb-2">Bit depth</p>
                    <div className="flex flex-col gap-1">
                      {(stats.bit_depth_distribution || []).map(({ depth, count }) => (
                        <div key={depth} className="flex justify-between text-zinc-300">
                          <span>{depth}-bit</span>
                          <span className="text-zinc-500">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-zinc-500 mb-2">Canales</p>
                    <div className="flex flex-col gap-1">
                      {(stats.channels_distribution || []).map(({ ch, count }) => (
                        <div key={ch} className="flex justify-between text-zinc-300">
                          <span>{ch === 2 ? "Stereo" : ch === 1 ? "Mono" : ch}</span>
                          <span className="text-zinc-500">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>

              <Card title="Tipo / estado / país de release">
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <p className="text-zinc-500 mb-2">Tipo</p>
                    <div className="flex flex-col gap-1">
                      {(stats.release_type_distribution || []).map(({ type, count }) => (
                        <div key={type} className="flex justify-between text-zinc-300">
                          <span>{type}</span><span className="text-zinc-500">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-zinc-500 mb-2">Estado</p>
                    <div className="flex flex-col gap-1">
                      {(stats.release_status_distribution || []).map(({ status, count }) => (
                        <div key={status} className="flex justify-between text-zinc-300">
                          <span>{status}</span><span className="text-zinc-500">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-zinc-500 mb-2">País (top)</p>
                    <div className="flex flex-col gap-1">
                      {(stats.release_country_distribution || []).slice(0, 8).map(({ country, count }) => (
                        <div key={country} className="flex justify-between text-zinc-300">
                          <span>{country}</span><span className="text-zinc-500">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </Section>

            {/* ── Coverage overview ── */}
            <Section title="Cobertura de metadatos (todos los campos)">
              <Card title="% de canciones con cada campo relleno" className="col-span-full">
                <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                  {(stats.coverage || [])
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .map(({ field, count, pct }) => (
                      <HBar
                        key={field}
                        label={field}
                        value={count}
                        max={stats.total}
                        pct={pct}
                        color={pct >= 80 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444"}
                      />
                    ))}
                </div>
              </Card>
            </Section>

            {/* ── Song list (only when filters active) ── */}
            {hasFilters && songsData?.songs?.length > 0 && (
              <Section title={`Canciones incluidas (${songsData.songs.length})`}>
                <Card title="" className="col-span-full p-0 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500">
                        <th className="text-left px-3 py-2 font-medium">Artista</th>
                        <th className="text-left px-3 py-2 font-medium">Título</th>
                        <th className="text-left px-3 py-2 font-medium">Álbum</th>
                        <th className="text-left px-3 py-2 font-medium">Sello</th>
                        <th className="text-right px-3 py-2 font-medium">Año</th>
                        <th className="text-right px-3 py-2 font-medium">BPM</th>
                        <th className="text-right px-3 py-2 font-medium">Key</th>
                        <th className="text-right px-3 py-2 font-medium">Dur.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {songsData.songs.map((s) => (
                        <tr key={s.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors">
                          <td className="px-3 py-1.5 text-zinc-200 truncate max-w-[160px]">{s.artist || "—"}</td>
                          <td className="px-3 py-1.5 text-zinc-300 truncate max-w-[180px]">{s.title || "—"}</td>
                          <td className="px-3 py-1.5 text-zinc-400 truncate max-w-[140px]">{s.album || "—"}</td>
                          <td className="px-3 py-1.5 text-zinc-500 truncate max-w-[120px]">{s.label || "—"}</td>
                          <td className="px-3 py-1.5 text-zinc-400 text-right">{s.year || "—"}</td>
                          <td className="px-3 py-1.5 text-zinc-300 text-right font-mono">{s.bpm ? s.bpm.toFixed(1) : "—"}</td>
                          <td className="px-3 py-1.5 text-cyan-400 text-right font-mono">{s.camelot || s.key_signature || "—"}</td>
                          <td className="px-3 py-1.5 text-zinc-500 text-right font-mono">{fmt(s.duration)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </Section>
            )}

          </div>
        )}
        {stats && stats.total === 0 && (
          <div className="flex items-center justify-center h-64 text-zinc-600">
            Sin canciones para los filtros seleccionados
          </div>
        )}
      </div>
    </div>
  );
}
