import React from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchFilterMeta } from "../api.js";

// Flat ordered list: 1A, 1B, 2A, 2B, ..., 12A, 12B
const CAMELOT_KEYS = Array.from({ length: 12 }, (_, i) => [`${i + 1}A`, `${i + 1}B`]).flat();

export default function FilterSidebar({ filters, onChange }) {
  const { data: meta } = useQuery({ queryKey: ["filterMeta"], queryFn: fetchFilterMeta });

  function set(key, val) {
    onChange({ ...filters, [key]: val, page: 1 });
  }

  function toggleTaste(t) {
    const cur = filters.taste || [];
    set("taste", cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]);
  }

  return (
    <aside className="w-52 shrink-0 flex flex-col gap-4 overflow-y-auto py-4 px-3 border-r border-zinc-800">
      <h2 className="font-semibold text-zinc-300 uppercase tracking-wider text-xs">Filtros</h2>

      {/* Taste / folder */}
      {meta?.tastes?.length > 0 && (
        <div>
          <p className="text-xs text-zinc-400 mb-1">Género / Carpeta</p>
          <div className="flex flex-col gap-0.5">
            {meta.tastes.map((t) => (
              <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(filters.taste || []).includes(t)}
                  onChange={() => toggleTaste(t)}
                  className="accent-indigo-500"
                />
                <span className="text-zinc-300">{t}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Camelot — 12 rows × 2 cols (1A 1B, 2A 2B, ...) */}
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
                  sel
                    ? "bg-indigo-500 text-white"
                    : isB
                    ? "bg-zinc-600 text-zinc-200 hover:bg-zinc-500"
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

      {/* Reset */}
      <button
        className="mt-auto text-xs text-zinc-500 hover:text-zinc-300 underline"
        onClick={() => onChange({ page: 1, sort: "artist", sortDir: "asc", search: "", tag: "", bpmMin: undefined, bpmMax: undefined, yearMin: undefined, yearMax: undefined })}
      >
        Limpiar filtros
      </button>
    </aside>
  );
}
