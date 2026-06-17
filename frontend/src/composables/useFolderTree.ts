import type { FlatFolder, SampleMetadata } from "../types";

interface FolderNode {
  name: string;
  path: string;
  depth: number;
  directSampleCount: number;
  totalSampleCount: number;
  children: Map<string, FolderNode>;
}

const folderIndexCache = new WeakMap<SampleMetadata[], FolderNode>();
const folderSampleIdsCache = new WeakMap<SampleMetadata[], Map<string, string[]>>();

function buildFolderIndex(samples: SampleMetadata[]): FolderNode {
  const cached = folderIndexCache.get(samples);
  if (cached) return cached;

  const root: FolderNode = {
    name: "",
    path: "",
    depth: -1,
    directSampleCount: 0,
    totalSampleCount: 0,
    children: new Map(),
  };

  for (const sample of samples) {
    const parts = sample.sample_path.split("/").filter(Boolean);
    let current = root;
    let accumulated = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      accumulated = accumulated ? `${accumulated}/${part}` : part;
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: accumulated,
          depth: current.depth + 1,
          directSampleCount: 0,
          totalSampleCount: 0,
          children: new Map(),
        });
      }
      current = current.children.get(part)!;
      if (i === parts.length - 1) {
        current.directSampleCount++;
      }
    }
  }

  function computeTotals(node: FolderNode): number {
    let total = node.directSampleCount;
    for (const child of node.children.values()) {
      total += computeTotals(child);
    }
    node.totalSampleCount = total;
    return total;
  }
  computeTotals(root);
  folderIndexCache.set(samples, root);
  return root;
}

export function flattenFolders(
  samples: SampleMetadata[],
  collapsedPaths: string[],
): FlatFolder[] {
  const collapsedSet = new Set(collapsedPaths);
  const root = buildFolderIndex(samples);

  const result: FlatFolder[] = [];

  function walk(node: FolderNode): void {
    const sorted = Array.from(node.children.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const child of sorted) {
      const hasChildren = child.children.size > 0;
      const expanded = !collapsedSet.has(child.path);
      result.push({
        path: child.path,
        name: child.name,
        depth: child.depth,
        hasChildren,
        expanded,
        sampleCount: child.totalSampleCount,
      });
      if (hasChildren && expanded) {
        walk(child);
      }
    }
  }

  walk(root);
  return result;
}

export function getFolderSamplePaths(
  samples: SampleMetadata[],
  folderPath: string,
): string[] {
  return samples
    .filter(
      (s) => s.sample_path === folderPath || s.sample_path.startsWith(`${folderPath}/`),
    )
    .map((s) => s.sample_path);
}

export function getFolderSampleIds(
  samples: SampleMetadata[],
  folderPath: string,
): string[] {
  let perSampleCache = folderSampleIdsCache.get(samples);
  if (!perSampleCache) {
    perSampleCache = new Map();
    folderSampleIdsCache.set(samples, perSampleCache);
  }
  const cached = perSampleCache.get(folderPath);
  if (cached) return cached;

  const ids = samples
    .filter((s) => s.sample_path === folderPath || s.sample_path.startsWith(`${folderPath}/`))
    .map((s) => s.sample_id);
  perSampleCache.set(folderPath, ids);
  return ids;
}
