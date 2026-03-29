import type { IResultMerger } from "../../types/interfaces.js";
import type { RankedResult, SearchResult, VectorRow } from "../../types/index.js";

/**
 * Convert LanceDB L2 distance (on normalized vectors) to cosine similarity [0, 1].
 * For normalized vectors: L2_distance = 2 * (1 - cosine_similarity)
 */
function distanceToSimilarity(distance: number): number {
  return Math.max(0, Math.min(1, 1 - distance / 2));
}

export class RRFMerger implements IResultMerger {
  constructor(private k: number = 60) {}

  merge(rankedLists: RankedResult[][], topK: number): SearchResult[] {
    const scoreMap = new Map<string, {
      rrfScore: number;
      row: VectorRow;
      listCount: number;
      bestDistance: number | undefined;
    }>();

    for (const list of rankedLists) {
      for (let rank = 0; rank < list.length; rank++) {
        const item = list[rank];
        const rrfScore = 1 / (this.k + rank + 1);
        const existing = scoreMap.get(item.id);
        if (existing) {
          existing.rrfScore += rrfScore;
          existing.listCount++;
          if (item.distance != null && (existing.bestDistance == null || item.distance < existing.bestDistance)) {
            existing.bestDistance = item.distance;
          }
        } else {
          scoreMap.set(item.id, {
            rrfScore,
            row: item.row,
            listCount: 1,
            bestDistance: item.distance,
          });
        }
      }
    }

    // Sort by RRF score (ordering — RRF is good at this)
    const sorted = Array.from(scoreMap.values()).sort((a, b) => b.rrfScore - a.rrfScore);
    if (sorted.length === 0) return [];

    // For display scores: use actual vector distance when available (meaningful similarity),
    // fall back to RRF-derived score for FTS-only results.
    const theoreticalMax = rankedLists.length / (this.k + 1);

    return sorted
      .slice(0, topK)
      .map(entry => {
        let displayScore: number;

        if (entry.bestDistance != null) {
          // Actual cosine similarity from vector search — honest, meaningful score
          displayScore = distanceToSimilarity(entry.bestDistance);
        } else {
          // FTS-only result — use RRF normalized score as fallback
          const normalized = Math.min(1, entry.rrfScore / theoreticalMax);
          const bonus = entry.listCount > 1 ? 0.05 : 0;
          displayScore = Math.min(1, normalized + bonus);
        }

        return this.toSearchResult(entry.row, Math.round(displayScore * 1000) / 1000);
      });
  }

  private toSearchResult(row: VectorRow, score: number): SearchResult {
    return {
      id: row.id,
      name: row.name,
      filePath: row.filePath,
      module: row.module,
      signature: row.signature,
      summary: row.summary,
      tags: row.tags
        ? String(row.tags).replace(/^,|,$/g, "").split(",").filter(Boolean)
        : [],
      score,
    };
  }
}
