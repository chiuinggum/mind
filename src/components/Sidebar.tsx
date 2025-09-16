import React from "react";
import { AVAILABLE_MODELS } from "../lib/constants";

type Props = {
  apiKey: string;
  setApiKey: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  children?: React.ReactNode;
};

export default function Sidebar({
  apiKey,
  setApiKey,
  model,
  setModel,
  children,
}: Props) {
  return (
    <div className="w-72 border-r border-slate-200 p-4 flex flex-col gap-3">
      <div className="text-lg font-semibold">Whiteboard Q/A</div>

      <label className="text-sm font-medium">OpenAI API Key</label>
      <input
        type="password"
        className="border rounded-xl p-2 text-sm"
        placeholder="sk-..."
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
      />

      <label className="text-sm font-medium">Model</label>
      <select
        className="border rounded-xl p-2 text-sm"
        value={model}
        onChange={(e) => setModel(e.target.value)}
      >
        {AVAILABLE_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>

      {children}

      <div className="text-xs text-slate-500 mt-2 leading-relaxed">
        Local-first. Data stored in your browser (IndexedDB). Use Export/Import
        for backup.
      </div>
    </div>
  );
}
