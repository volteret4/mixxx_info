import React from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRecommendations } from "../api.js";

function RecommendationCard({ artist, reference, note }) {
  return (
    <div className="rounded-md bg-zinc-900 border border-zinc-800 p-2.5">
      <p className="text-zinc-100 text-sm font-semibold leading-tight">{artist}</p>
      {reference && <p className="text-indigo-300 text-xs mt-0.5">{reference}</p>}
      {note && <p className="text-zinc-500 text-xs mt-1 leading-snug">{note}</p>}
    </div>
  );
}

function CrateSection({ label, items }) {
  return (
    <section>
      <h2 className="text-zinc-200 font-semibold text-sm uppercase tracking-wide mb-2">
        {label} <span className="text-zinc-600 font-normal">({items.length})</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {items.map((it, i) => (
          <RecommendationCard key={i} {...it} />
        ))}
      </div>
    </section>
  );
}

export default function RecommendationsPage({ onBack }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["recommendations"],
    queryFn: fetchRecommendations,
  });

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <button onClick={onBack} className="text-zinc-400 hover:text-zinc-100 text-sm shrink-0">← Volver</button>
        <h1 className="font-semibold text-zinc-200 shrink-0">🎯 Recomendaciones</h1>
        <p className="text-zinc-500 text-xs">Por cajón, calibradas contra lo que ya tienes</p>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col gap-6">
        {isLoading && <p className="text-zinc-500 text-sm">Cargando…</p>}
        {error && <p className="text-red-400 text-sm">Error: {error.message}</p>}
        {data?.order?.map((crate) => (
          <CrateSection key={crate} label={data.crates[crate].label} items={data.crates[crate].items} />
        ))}
        {data && data.order.length === 0 && (
          <p className="text-zinc-500 text-sm">Sin recomendaciones todavía — corre seed_recommendations.py.</p>
        )}
      </div>
    </div>
  );
}
