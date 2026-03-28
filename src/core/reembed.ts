import type { IFunctionIndexReader, IEmbeddingProvider, IVectorDatabase, Config } from "../types/interfaces.js";
import type { FunctionRecord, VectorRow } from "../types/index.js";
import { buildChunk } from "./chunk-builder.js";

export async function reembedFunctions(
  changedIds: string[],
  index: IFunctionIndexReader,
  embedding: IEmbeddingProvider,
  vectorDb: IVectorDatabase,
  config: Config,
): Promise<void> {
  const records = changedIds
    .map(id => index.getById(id))
    .filter((r): r is FunctionRecord => r !== null);

  if (records.length === 0) return;

  const chunkConfig = {
    expandCamelCase: config.search.expandCamelCase,
    maxChunkTokens: config.indexing.maxChunkTokens,
  };
  const chunks = records.map(r => buildChunk(r, chunkConfig));

  // Batch embed — with partial failure protection
  const batchSize = config.embedding.batchSize;
  const allVectors: Float32Array[] = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    try {
      const vectors = await embedding.embedDocuments(batch);
      allVectors.push(...vectors);
    } catch (err) {
      // Fill failed batch with zero vectors to maintain index alignment
      for (let j = 0; j < batch.length; j++) {
        allVectors.push(new Float32Array(embedding.dimensions));
      }
    }
  }

  // Safety: ensure vectors and records have same length
  if (allVectors.length !== records.length) return;

  // Build VectorRows
  const rows: VectorRow[] = records.map((record, i) => ({
    id: record.id,
    vector: allVectors[i],
    filePath: record.filePath,
    module: record.module,
    name: record.name,
    signature: record.signature,
    summary: record.docstring?.summary || "",
    tags: record.docstring?.tags.length ? `,${record.docstring.tags.join(",")},` : "",
    sideEffects: record.docstring?.sideEffects.length ? `,${record.docstring.sideEffects.join(",")},` : "",
    chunkText: chunks[i],
  }));

  await vectorDb.upsert(rows);
}
