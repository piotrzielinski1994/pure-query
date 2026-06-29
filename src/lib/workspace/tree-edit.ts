import type { TreeNode } from "@/lib/workspace/model";

export function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.kind === "folder") {
      const found = findNode(node.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function containsId(node: TreeNode, id: string): boolean {
  if (node.id === id) {
    return true;
  }
  if (node.kind === "folder") {
    return node.children.some((child) => containsId(child, id));
  }
  return false;
}

export function removeNode(nodes: TreeNode[], id: string): TreeNode[] {
  return nodes.flatMap<TreeNode>((node) => {
    if (node.id === id) {
      return [];
    }
    if (node.kind === "folder") {
      return [{ ...node, children: removeNode(node.children, id) }];
    }
    return [node];
  });
}

export function insertNode(
  nodes: TreeNode[],
  parentId: string | null,
  index: number,
  toInsert: TreeNode,
): TreeNode[] {
  if (parentId === null) {
    const at = Math.max(0, Math.min(index, nodes.length));
    return [...nodes.slice(0, at), toInsert, ...nodes.slice(at)];
  }
  return nodes.map((node) => {
    if (node.kind !== "folder") {
      return node;
    }
    if (node.id === parentId) {
      const at = Math.max(0, Math.min(index, node.children.length));
      return {
        ...node,
        children: [
          ...node.children.slice(0, at),
          toInsert,
          ...node.children.slice(at),
        ],
      };
    }
    return {
      ...node,
      children: insertNode(node.children, parentId, index, toInsert),
    };
  });
}
