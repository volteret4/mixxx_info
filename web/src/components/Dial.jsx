import React from "react";

export default function Dial({ label, value, onChange, min = 1, max = 30 }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[11px] text-zinc-400 text-center leading-tight">{label}</span>
      <div className="flex items-center gap-1">
        <button
          className="w-6 h-6 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-bold text-base leading-none"
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <span className="w-8 text-center font-mono text-zinc-100 text-sm select-none">{value}</span>
        <button
          className="w-6 h-6 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-bold text-base leading-none"
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}
