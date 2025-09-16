export type Board = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type NodeRow = {
  id: string;
  boardId: string;
  parentId: string | null;
  question: string;
  answer?: string;
  loading?: boolean;
  x: number;
  y: number;
  h?: number;
  createdAt: string;
  updatedAt: string;
};
