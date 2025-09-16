import { useEffect, useMemo, useState, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Position,
  Handle,
  useUpdateNodeInternals,
} from "reactflow";
import { db, uid } from "../lib/db";
import type { NodeRow } from "../lib/models";
import { useSettingsStore } from "../store/useSettingsStore";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

const MIN_H = 180; // 使用者不能低於這個高度
const MAX_H = 720; // 可自行調整上限
const DEFAULT_H = 280; // 新卡片預設高度

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
  onResizeHeight,
}: {
  n: NodeRow;
  onAddChild: (parentId: string) => void;
  onResizeHeight: (id: string, h: number, commit?: boolean) => void;
}) {
  const updateNodeInternals = useUpdateNodeInternals();

  const startY = useRef(0);
  const startH = useRef(n.h ?? DEFAULT_H);

  useEffect(() => {
    updateNodeInternals(n.id);
  }, [n.id, n.h, updateNodeInternals]);

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    startY.current = e.clientY;
    startH.current = n.h ?? DEFAULT_H;

    const onMove = (ev: MouseEvent) => {
      const dh = ev.clientY - startY.current;
      onResizeHeight(n.id, startH.current + dh, false); // 即時更新
    };
    const onUp = (ev: MouseEvent) => {
      const dh = ev.clientY - startY.current;
      onResizeHeight(n.id, startH.current + dh, true); // 落地寫 DB
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = prevUserSelect;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const heightPx = n.h ?? DEFAULT_H;
  return (
    <div
      className="relative rounded-2xl bg-white border border-slate-200 shadow-md p-0 min-w-[320px] max-w-[560px] flex flex-col"
      style={{ height: heightPx, willChange: "height" }}
    >
      {/* handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{
          left: -8,
          width: 10,
          height: 10,
          background: "transparent",
          border: "none",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{
          right: -8,
          width: 10,
          height: 10,
          background: "transparent",
          border: "none",
        }}
      />

      {/* Header（不捲動） */}
      <div className="px-4 pt-3 pb-2 drag-handle cursor-grab active:cursor-grabbing">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          QUESTION
        </div>
        {/* 問題（Markdown） */}
        <div className="prose prose-slate prose-sm max-w-none leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              h1: (p) => <h3 className="text-base font-semibold" {...p} />,
              h2: (p) => <h4 className="text-sm font-semibold" {...p} />,
              h3: (p) => <h5 className="text-sm font-semibold" {...p} />,
              table: (p) => (
                <table className="text-xs border-collapse" {...p} />
              ),
              th: (p) => <th className="border px-2 py-1" {...p} />,
              td: (p) => <td className="border px-2 py-1 align-top" {...p} />,

              /* 用 pre 控制區塊程式碼，避免溢出；code(block) 只負責字體大小 */
              pre: (p) => <pre className="overflow-x-auto max-w-full" {...p} />,

              code: (p) =>
                // @ts-expect-error: ReactMarkdown does not type 'inline', but it's present at runtime
                p.inline ? (
                  <code className="px-1 py-0.5 rounded bg-slate-100" {...p} />
                ) : (
                  <code className="text-xs" {...p} />
                ),

              ul: (p) => <ul className="list-disc ml-5" {...p} />,
              ol: (p) => <ol className="list-decimal ml-5" {...p} />,
            }}
          >
            {n.question}
          </ReactMarkdown>
        </div>
      </div>

      {/* Scrollable content */}
      <div
        className="px-4 flex-1 overflow-auto nowheel nodrag"
        onWheelCapture={(e) => e.stopPropagation()} // 滾輪只給容器
        onMouseDownCapture={(e) => e.stopPropagation()} // 避免被當作拖動畫布
        style={{ overscrollBehavior: "contain" }}
      >
        <div className="mt-3 text-xs uppercase tracking-wide text-slate-500 flex items-center gap-2">
          ANSWER{" "}
          {n.loading ? (
            <span className="animate-pulse text-slate-400">(loading)</span>
          ) : null}
        </div>

        {/* 回答（Markdown） */}
        <div className="break-words text-slate-800">
          {n.loading ? null : n.answer ? (
            <div className="prose prose-slate prose-sm max-w-none leading-relaxed">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  h1: (p) => <h3 className="text-base font-semibold" {...p} />,
                  h2: (p) => <h4 className="text-sm font-semibold" {...p} />,
                  h3: (p) => <h5 className="text-sm font-semibold" {...p} />,
                  table: (p) => (
                    <table className="text-xs border-collapse" {...p} />
                  ),
                  th: (p) => <th className="border px-2 py-1" {...p} />,
                  td: (p) => (
                    <td className="border px-2 py-1 align-top" {...p} />
                  ),

                  /* 用 pre 控制區塊程式碼，避免溢出；code(block) 只負責字體大小 */
                  pre: (p) => (
                    <pre className="overflow-x-auto max-w-full" {...p} />
                  ),
                  code: (p) =>
                    // @ts-expect-error: ReactMarkdown does not type 'inline', but it's present at runtime
                    p.inline ? (
                      <code
                        className="px-1 py-0.5 rounded bg-slate-100"
                        {...p}
                      />
                    ) : (
                      <code className="text-xs" {...p} />
                    ),

                  ul: (p) => <ul className="list-disc ml-5" {...p} />,
                  ol: (p) => <ol className="list-decimal ml-5" {...p} />,
                }}
              >
                {n.answer}
              </ReactMarkdown>
            </div>
          ) : (
            "—"
          )}
        </div>
      </div>

      {/* Footer（不捲動） */}
      <div className="px-4 py-2 border-t border-slate-100 flex justify-end">
        <button
          className="px-3 py-1 rounded-xl border border-slate-300 hover:bg-slate-50"
          onClick={() => onAddChild(n.id)}
        >
          Add child
        </button>
      </div>

      {/* 底部拖曳手把（高度調整）；也可以放右下角 */}
      <div
        onMouseDown={onDragStart}
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize nodrag nowheel nopan"
        title="Drag to resize height"
      />
    </div>
  );
}

// --- 主畫面
export default function BoardPage({ boardId }: { boardId: string }) {
  const { apiKey, model } = useSettingsStore();
  const [boardName, setBoardName] = useState<string>("");
  const [nodes, setNodes] = useState<NodeRow[]>([]);

  // 讓子元件呼叫：即時更新畫面；結束拖曳時寫回 DB
  const resizeNodeHeight = async (id: string, h: number, commit = false) => {
    const clamped = Math.max(MIN_H, Math.min(MAX_H, Math.round(h)));
    // 先更新前端狀態（即時跟著游標）
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, h: clamped } : n))
    );

    if (commit) {
      const now = new Date().toISOString();
      await db.nodes.update(id, { h: clamped, updatedAt: now });
    }
  };

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
        dragHandle: ".drag-handle",
      })),
    [nodes]
  );

  const rfEdges = useMemo(
    () =>
      nodes
        .filter((n) => n.parentId)
        .map((n) => ({
          id: `${n.parentId}->${n.id}`,
          source: n.parentId!,
          target: n.id,
          type: "straight",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: "#94a3b8",
          },
          style: { stroke: "#94a3b8", strokeWidth: 2 },
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
      h: DEFAULT_H,
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
              <NodeCard
                n={data as NodeRow}
                onAddChild={addChild}
                onResizeHeight={resizeNodeHeight}
              />
            ),
          }}
          onNodesChange={onNodesChange}
          onNodeDrag={(_, node) => {
            setNodes((prev) =>
              prev.map((n) =>
                n.id === node.id
                  ? { ...n, x: node.position.x, y: node.position.y }
                  : n
              )
            );
          }}
          onNodeDragStop={(_, node) => {
            setNodes((prev) =>
              prev.map((n) =>
                n.id === node.id
                  ? { ...n, x: node.position.x, y: node.position.y }
                  : n
              )
            );
          }}
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
