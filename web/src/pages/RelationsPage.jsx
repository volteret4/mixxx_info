import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRelations, deleteRelation } from "../api.js";

// mermaid pesa bastante (empaqueta todos sus tipos de diagrama) -- se carga
// solo al entrar en esta página, no en el bundle principal que usan el resto
// (librería, estadísticas...), que son las vistas que se abren mucho más.
let mermaidModulePromise = null;
function loadMermaid() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid").then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose", flowchart: { curve: "basis" } });
      return mermaid;
    });
  }
  return mermaidModulePromise;
}

function esc(s) {
  return (s || "").replace(/"/g, "'");
}

function slug(artist, title) {
  return `n${(artist + "_" + title).replace(/[^a-zA-Z0-9]/g, "_")}`;
}

/** Construye un `graph LR` de Mermaid a partir de las aristas crudas. */
function buildMermaidDef(relations) {
  const lines = ["graph LR"];
  const seen = new Set();
  for (const r of relations) {
    const a = slug(r.from.artist, r.from.title);
    const b = slug(r.to.artist, r.to.title);
    if (!seen.has(a)) {
      lines.push(`  ${a}["${esc(r.from.artist)} - ${esc(r.from.title)}"]`);
      seen.add(a);
    }
    if (!seen.has(b)) {
      lines.push(`  ${b}["${esc(r.to.artist)} - ${esc(r.to.title)}"]`);
      seen.add(b);
    }
    const label = r.comment ? `|"${esc(r.comment)}"|` : "";
    lines.push(`  ${a} -->${label} ${b}`);
  }
  return lines.join("\n");
}

export default function RelationsPage({ onBack }) {
  const { data: relations, isLoading, refetch } = useQuery({
    queryKey: ["relations"],
    queryFn: () => fetchRelations(),
  });

  const [svg, setSvg] = useState("");
  const [renderError, setRenderError] = useState(null);

  const def = useMemo(() => (relations?.length ? buildMermaidDef(relations) : ""), [relations]);

  useEffect(() => {
    if (!def) {
      setSvg("");
      return;
    }
    let cancelled = false;
    loadMermaid()
      .then((mermaid) => mermaid.render("relations-graph", def))
      .then(({ svg: rendered }) => {
        if (!cancelled) setSvg(rendered);
      })
      .catch((e) => {
        if (!cancelled) setRenderError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [def]);

  async function handleDelete(id) {
    await deleteRelation(id);
    refetch();
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <button onClick={onBack} className="text-zinc-400 hover:text-zinc-100 text-sm shrink-0">← Volver</button>
        <h1 className="font-semibold text-zinc-200 shrink-0">🔗 Relaciones</h1>
        <span className="text-xs text-zinc-500 ml-auto">
          {relations?.length || 0} transiciones curadas
        </span>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading && <div className="text-zinc-600 text-sm">Cargando…</div>}

        {!isLoading && (!relations || relations.length === 0) && (
          <div className="text-zinc-600 text-sm max-w-xl">
            Todavía no hay relaciones guardadas. Se crean desde el portátil con{" "}
            <code className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300">relacionar_mix.py</code>{" "}
            (Shift+Enter o Ctrl+Enter en el diálogo de comentario de{" "}
            <code className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300">mover_mix_playerctl.py</code>).
          </div>
        )}

        {renderError && (
          <div className="text-red-400 text-xs mb-4">Error renderizando el diagrama: {renderError}</div>
        )}

        {svg && (
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 overflow-auto mb-6 [&_svg]:max-w-none"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}

        {relations?.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">Lista</h3>
            <div className="flex flex-col gap-1.5">
              {relations.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-2 text-xs bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
                >
                  <span className="text-zinc-200">{r.from.artist} - {r.from.title}</span>
                  <span className="text-zinc-600">→</span>
                  <span className="text-zinc-200">{r.to.artist} - {r.to.title}</span>
                  {r.comment && <span className="text-zinc-500 italic">“{r.comment}”</span>}
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="ml-auto text-zinc-600 hover:text-red-400"
                    title="Eliminar relación"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
