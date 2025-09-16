import { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap } from "reactflow";
import "reactflow/dist/style.css";
import { db, uid } from "../lib/db";
import type { NodeRow } from "../lib/models";
import { useSettingsStore } from "../store/useSettingsStore";

// --- askOpenAI 與 NodeCard（與你現有版本一致，略）
async function askOpenAI(opts: {
  apiKey: string;
  model: string;
  context: { role: "user" | "assistant"; content: string }[];
  question: string;
}): Promise<string> {
  const { apiKey, model, context, question } = opts;
  const messages = [...context, { role: "user", content: question }];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.2 }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "(no answer)";
}

function NodeCard({
  n,
  onAddChild,
}: {
  n: NodeRow;
  onAddChild: (parentId: string) => void;
}) {
  return (
    <div className="rounded-2xl shadow-lg bg-white p-3 w-[320px] border border-slate-200">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        Question
      </div>
      <div className="font-medium whitespace-pre-wrap break-words">
        {n.question}
      </div>
      <div className="mt-3 text-xs uppercase tracking-wide text-slate-500 flex items-center gap-2">
        Answer{" "}
        {n.loading ? (
          <span className="animate-pulse text-slate-400">(loading)</span>
        ) : null}
      </div>
      <div className="whitespace-pre-wrap break-words text-slate-800">
        {n.answer ?? (n.loading ? "" : "—")}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          className="px-3 py-1 rounded-xl border border-slate-300 hover:bg-slate-50"
          onClick={() => onAddChild(n.id)}
        >
          Add child
        </button>
      </div>
    </div>
  );
}

// --- 主畫面
export default function BoardPage({ boardId }: { boardId: string }) {
  const { apiKey, model } = useSettingsStore();
  const [boardName, setBoardName] = useState<string>("");
  const [nodes, setNodes] = useState<NodeRow[]>([]);

  const load = async () => {
    const b = await db.boards.get(boardId);
    const ns = await db.nodes.where({ boardId }).toArray();
    setBoardName(b?.name ?? "");
    setNodes(ns);
  };
  useEffect(() => {
    load();
  }, [boardId]);

  const rfNodes = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        position: { x: n.x, y: n.y },
        data: n,
        type: "default",
      })),
    [nodes]
  );

  const rfEdges = useMemo(
    () =>
      nodes
        .filter((n) => n.parentId)
        .map((n) => ({
          id: `${n.parentId}->${n.id}`,
          source: String(n.parentId),
          target: n.id,
        })),
    [nodes]
  );

  const buildContext = (
    parentId: string | null
  ): { role: "user" | "assistant"; content: string }[] => {
    if (!parentId) return [];
    const path: NodeRow[] = [];
    let cur = nodes.find((n) => n.id === parentId) || null;
    while (cur) {
      path.push(cur);
      cur = cur.parentId
        ? nodes.find((n) => n.id === cur!.parentId!) || null
        : null;
    }
    path.reverse();
    const msgs: { role: "user" | "assistant"; content: string }[] = [];
    for (const n of path) {
      msgs.push({ role: "user", content: n.question });
      if (n.answer) msgs.push({ role: "assistant", content: n.answer });
    }
    return msgs;
  };

  const nextPosition = (parent: NodeRow | null) => {
    if (!parent) {
      const roots = nodes.filter((n) => !n.parentId);
      return { x: 0, y: roots.length * 180 };
    } else {
      const siblings = nodes.filter((n) => n.parentId === parent.id);
      return { x: parent.x + 380, y: parent.y + siblings.length * 160 - 60 };
    }
  };

  const addRoot = async () => {
    const question = prompt("Ask a question (root):");
    if (!question) return;
    await createAndAnswer({ question, parentId: null });
  };

  const addChild = async (parentId: string) => {
    const question = prompt("Ask a follow-up:");
    if (!question) return;
    await createAndAnswer({ question, parentId });
  };

  const createAndAnswer = async ({
    question,
    parentId,
  }: {
    question: string;
    parentId: string | null;
  }) => {
    const now = new Date().toISOString();
    const parent = parentId
      ? nodes.find((n) => n.id === parentId) || null
      : null;
    const pos = nextPosition(parent);
    const nodeId = uid();
    const newNode: NodeRow = {
      id: nodeId,
      boardId,
      parentId,
      question,
      x: pos.x,
      y: pos.y,
      loading: true,
      createdAt: now,
      updatedAt: now,
    };

    await db.nodes.add(newNode);
    setNodes((prev) => [...prev, newNode]);
    await db.boards.update(boardId, { updatedAt: now });

    try {
      if (!apiKey) throw new Error("Missing OpenAI API key.");
      const ctx = buildContext(parentId);
      const answer = await askOpenAI({ apiKey, model, context: ctx, question });
      const updated = {
        answer,
        loading: false,
        updatedAt: new Date().toISOString(),
      };
      await db.nodes.update(nodeId, updated);
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, ...updated } : n))
      );
    } catch (err: any) {
      const updated = {
        loading: false,
        answer: `Error: ${err?.message || err}`,
        updatedAt: new Date().toISOString(),
      };
      await db.nodes.update(nodeId, updated);
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, ...updated } : n))
      );
    }
  };

  const onNodesChange = (changes: any) => {
    const finals: Record<string, { x: number; y: number }> = {};
    for (const ch of changes) {
      if (ch.type === "position" && ch.dragging === false)
        finals[ch.id] = ch.position;
    }
    const ids = Object.keys(finals);
    if (ids.length) {
      (async () => {
        const now = new Date().toISOString();
        await db.transaction("rw", db.nodes, async () => {
          for (const id of ids) {
            await db.nodes.update(id, {
              x: finals[id].x,
              y: finals[id].y,
              updatedAt: now,
            });
          }
        });
        setNodes((prev) =>
          prev.map((n) =>
            finals[n.id] ? { ...n, ...finals[n.id], updatedAt: now } : n
          )
        );
      })();
    }
  };

  const exportBoard = async () => {
    const ns = await db.nodes.where({ boardId }).toArray();
    const blob = new Blob(
      [JSON.stringify({ boardId, name: boardName, nodes: ns }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(boardName || "board").replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBoard = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const txt = await f.text();
      try {
        const parsed = JSON.parse(txt);
        if (!Array.isArray(parsed?.nodes)) throw new Error("Invalid file");
        if (!confirm("Import will REPLACE this board's nodes. Continue?"))
          return;
        await db.transaction("rw", db.nodes, async () => {
          await db.nodes.where({ boardId }).delete();
          const re = parsed.nodes.map((n: any) => ({ ...n, boardId }));
          await db.nodes.bulkAdd(re);
        });
        await db.boards.update(boardId, {
          updatedAt: new Date().toISOString(),
        });
        load();
      } catch (e: any) {
        alert("Import failed: " + (e?.message || e));
      }
    };
    input.click();
  };

  return (
    <div className="flex-1 h-screen flex flex-col">
      <div className="px-4 py-2 border-b flex items-center gap-2">
        <div className="font-medium">{boardName || "(loading...)"}</div>
        <div className="ml-auto flex gap-2">
          <button className="px-3 py-2 rounded-xl border" onClick={addRoot}>
            + New root question
          </button>
          <button className="px-3 py-2 rounded-xl border" onClick={exportBoard}>
            Export
          </button>
          <button className="px-3 py-2 rounded-xl border" onClick={importBoard}>
            Import
          </button>
        </div>
      </div>

      <div className="flex-1">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={{
            default: ({ data }: any) => (
              <NodeCard n={data as NodeRow} onAddChild={addChild} />
            ),
          }}
          onNodesChange={onNodesChange}
          fitView
        >
          <Background />
          <MiniMap pannable zoomable />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
