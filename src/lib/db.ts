import Dexie from "dexie";
import type { Table } from "dexie";
import type { Board, NodeRow } from "./models";

class WBDB extends Dexie {
  boards!: Table<Board, string>;
  nodes!: Table<NodeRow, string>;
  constructor() {
    super("wbqa_db_v1");
    this.version(1).stores({
      boards: "id, name, createdAt, updatedAt",
      nodes: "id, boardId, parentId, createdAt, updatedAt, [boardId+parentId]",
    });
  }
}
export const db = new WBDB();
export const uid = () => Math.random().toString(36).slice(2, 10);
