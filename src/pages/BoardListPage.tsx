import { useEffect, useState } from "react";
import { db } from "../lib/db";
import type { Board } from "../lib/models";
import { uid } from "../lib/db";

export default function BoardListPage({
  onOpen,
}: {
  onOpen: (id: string) => void;
}) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [name, setName] = useState("");

  const reload = async () => {
    const list = await db.boards.orderBy("updatedAt").reverse().toArray();
    setBoards(list);
  };
  useEffect(() => {
    reload();
  }, []);

  const createBoard = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    await db.boards.add({
      id: uid(),
      name: trimmed,
      createdAt: now,
      updatedAt: now,
    });
    setName("");
    reload();
  };

  const renameBoard = async (b: Board) => {
    const nn = prompt("Rename board", b.name);
    if (!nn) return;
    await db.boards.update(b.id, {
      name: nn,
      updatedAt: new Date().toISOString(),
    });
    reload();
  };

  const deleteBoard = async (b: Board) => {
    if (!confirm(`Delete board "${b.name}"? This will remove all its nodes.`))
      return;
    await db.transaction("rw", db.boards, db.nodes, async () => {
      await db.nodes.where({ boardId: b.id }).delete();
      await db.boards.delete(b.id);
    });
    reload();
  };

  const exportAll = async () => {
    const allBoards = await db.boards.toArray();
    const allNodes = await db.nodes.toArray();
    const blob = new Blob(
      [JSON.stringify({ boards: allBoards, nodes: allNodes }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wbqa-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importAll = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const txt = await f.text();
      try {
        const parsed = JSON.parse(txt);
        if (!parsed?.boards || !parsed?.nodes) throw new Error("Invalid file");
        await db.transaction("rw", db.boards, db.nodes, async () => {
          await db.boards.clear();
          await db.nodes.clear();
          await db.boards.bulkAdd(parsed.boards);
          await db.nodes.bulkAdd(parsed.nodes);
        });
        alert("Import success");
        reload();
      } catch (e: any) {
        alert("Import failed: " + (e?.message || e));
      }
    };
    input.click();
  };

  return (
    <div className="p-6 flex-1">
      <div className="flex items-center gap-2">
        <input
          className="border rounded-xl p-2 text-sm flex-1"
          placeholder="New board name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="px-3 py-2 rounded-xl bg-black text-white"
          onClick={createBoard}
        >
          Create
        </button>
        <button className="px-3 py-2 rounded-xl border" onClick={exportAll}>
          Export all
        </button>
        <button className="px-3 py-2 rounded-xl border" onClick={importAll}>
          Import all
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3">
        {boards.map((b) => (
          <div
            key={b.id}
            className="border rounded-2xl p-4 flex items-center justify-between"
          >
            <div>
              <div className="font-medium">{b.name}</div>
              <div className="text-xs text-slate-500">
                Updated {new Date(b.updatedAt).toLocaleString()}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 rounded-xl border"
                onClick={() => onOpen(b.id)}
              >
                Open
              </button>
              <button
                className="px-3 py-1 rounded-xl border"
                onClick={() => renameBoard(b)}
              >
                Rename
              </button>
              <button
                className="px-3 py-1 rounded-xl border"
                onClick={() => deleteBoard(b)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {boards.length === 0 && (
          <div className="text-sm text-slate-500">
            No boards yet. Create one above.
          </div>
        )}
      </div>
    </div>
  );
}
