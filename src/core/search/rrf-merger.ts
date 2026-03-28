import type { IResultMerger } from "../../types/interfaces.js";
import type { RankedResult, SearchResult, VectorRow } from "../../types/index.js";

export class RRFMerger implements IResultMerger {
  constructor(private k: number = 60) {}

  merge(rankedLists: RankedResult[][], topK: number): SearchResult[] {
    const scoreMap = new Map<string, { score: number; row: VectorRow; listCount: number }>();

    for (const list of rankedLists) {
      for (let rank = 0; rank < list.length; rank++) {
        const item = list[rank];
        const rrfScore = 1 / (this.k + rank + 1);
        const existing = scoreMap.get(item.id);
        if (existing) {
          existing.score += rrfScore;
          existing.listCount++;
        } else {
          scoreMap.set(item.id, { score: rrfScore, row: item.row, listCount: 1 });
        }
      }
    }

    const sorted = Array.from(scoreMap.values()).sort((a, b) => b.score - a.score);
    if (sorted.length === 0) return [];

    // Normalize scores to 0-1 range (relative to best score)
    const maxScore = sorted[0].score;
    const minScore = sorted[sorted.length - 1]?.score || 0;
    const range = maxScore - minScore;

    return sorted
      .slice(0, topK)
      .map(entry => {
        // Normalized score: best result = 1.0, worst = 0.0
        // Bonus for appearing in multiple lists
        const normalized = range > 0 ? (entry.score - minScore) / range : 1;
        const listBonus = entry.listCount > 1 ? 0.1 : 0; // Boost items found by both vector + FTS
        const finalScore = Math.min(1, normalized + listBonus);

        return this.toSearchResult(entry.row, Math.round(finalScore * 1000) / 1000);
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
