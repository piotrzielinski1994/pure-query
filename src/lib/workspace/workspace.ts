import type {
  DbEngine,
  QueryResult,
  TreeNode,
} from "@/components/workspace/mock-data";

export type PersistedDatabase = {
  kind: "database";
  id: string;
  name: string;
  engine: DbEngine;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

export type PersistedFolder = {
  kind: "folder";
  id: string;
  name: string;
  children: PersistedNode[];
};

export type PersistedNode = PersistedFolder | PersistedDatabase;

export type PersistedWorkspace = {
  version: 1;
  tree: PersistedNode[];
};

export type WorkspaceStore = {
  load: () => Promise<PersistedWorkspace>;
  save: (workspace: PersistedWorkspace) => Promise<void>;
};

export const DEFAULT_WORKSPACE: PersistedWorkspace = {
  version: 1,
  tree: [],
};

const ENGINES = new Set<DbEngine>(["postgres", "mysql"]);

const EMPTY_RESULT: QueryResult = {
  status: "success",
  timeMs: 0,
  rowCount: 0,
  columns: [],
  rows: [],
  message: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeDatabase(value: Record<string, unknown>): PersistedDatabase | null {
  const { id, name, engine, host, port, database, user, password } = value;
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof engine !== "string" ||
    !ENGINES.has(engine as DbEngine) ||
    typeof host !== "string" ||
    typeof port !== "number" ||
    typeof database !== "string" ||
    typeof user !== "string" ||
    typeof password !== "string"
  ) {
    return null;
  }
  return {
    kind: "database",
    id,
    name,
    engine: engine as DbEngine,
    host,
    port,
    database,
    user,
    password,
  };
}

function mergeFolder(value: Record<string, unknown>): PersistedFolder | null {
  const { id, name, children } = value;
  if (typeof id !== "string" || typeof name !== "string") {
    return null;
  }
  return {
    kind: "folder",
    id,
    name,
    children: Array.isArray(children) ? mergeNodes(children) : [],
  };
}

function mergeNode(value: unknown): PersistedNode | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.kind === "database") {
    return mergeDatabase(value);
  }
  if (value.kind === "folder") {
    return mergeFolder(value);
  }
  return null;
}

function mergeNodes(values: unknown[]): PersistedNode[] {
  return values
    .map(mergeNode)
    .filter((node): node is PersistedNode => node !== null);
}

export function mergeWorkspace(partial: unknown): PersistedWorkspace {
  if (!isRecord(partial) || !Array.isArray(partial.tree)) {
    return DEFAULT_WORKSPACE;
  }
  return { version: 1, tree: mergeNodes(partial.tree) };
}

export function hydrate(tree: PersistedNode[]): TreeNode[] {
  return tree.map(hydrateNode);
}

function hydrateNode(node: PersistedNode): TreeNode {
  if (node.kind === "folder") {
    return {
      kind: "folder",
      id: node.id,
      name: node.name,
      children: node.children.map(hydrateNode),
    };
  }
  return {
    kind: "database",
    id: node.id,
    name: node.name,
    engine: node.engine,
    host: node.host,
    port: node.port,
    database: node.database,
    user: node.user,
    password: node.password,
    tables: [],
    views: [],
    sql: "",
    savedScripts: [],
    script: "",
    result: { ...EMPTY_RESULT },
  };
}

export function dehydrate(tree: TreeNode[]): PersistedWorkspace {
  return { version: 1, tree: tree.flatMap(dehydrateNode) };
}

function dehydrateNode(node: TreeNode): PersistedNode[] {
  if (node.kind === "table") {
    return [];
  }
  if (node.kind === "folder") {
    return [
      {
        kind: "folder",
        id: node.id,
        name: node.name,
        children: node.children.flatMap(dehydrateNode),
      },
    ];
  }
  return [
    {
      kind: "database",
      id: node.id,
      name: node.name,
      engine: node.engine,
      host: node.host,
      port: node.port,
      database: node.database,
      user: node.user,
      password: node.password,
    },
  ];
}
