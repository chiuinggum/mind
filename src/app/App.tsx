import React from "react";
import BoardListPage from "../pages/BoardListPage";
import BoardPage from "../pages/BoardPage";
import Sidebar from "../components/Sidebar";
import { useSettingsStore } from "../store/useSettingsStore";

export default function App() {
  const { apiKey, model, setApiKey, setModel } = useSettingsStore();
  const [boardId, setBoardId] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      // @ts-ignore
      if (navigator.storage?.persist) {
        try {
          await navigator.storage.persist();
        } catch {}
      }
    })();
  }, []);

  return (
    <div className="w-full h-screen flex">
      {/* 直接放 Sidebar；不要再多一層 w-72 容器 */}
      <Sidebar
        model={model}
        setModel={setModel}
        apiKey={apiKey}
        setApiKey={setApiKey}
      >
        {boardId && (
          <button
            className="mt-2 px-3 py-2 rounded-xl border"
            onClick={() => setBoardId(null)}
          >
            ← Back to boards
          </button>
        )}
      </Sidebar>

      {/* Main area */}
      {!boardId ? (
        <BoardListPage onOpen={setBoardId} />
      ) : (
        <BoardPage boardId={boardId} />
      )}
    </div>
  );
}
