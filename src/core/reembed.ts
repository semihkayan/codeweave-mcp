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

  // Batch embed — skip failed batches instead of inserting zero vectors
  const batchSize = config.embedding.batchSize;
  const successIndices: number[] = [];
  const allVectors: Float32Array[] = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    try {
      const vectors = await embedding.embedDocuments(batch);
      for (let j = 0; j < vectors.length; j++) {
        allVectors.push(vectors[j]);
        successIndices.push(i + j);
      }
    } catch {
      // Skip failed batch — these records won't be embedded
      // They'll be retried on the next reindex or file change
    }
  }

  if (successIndices.length === 0) return;

  // Build VectorRows only for successfully embedded records
  const rows: VectorRow[] = successIndices.map((idx, i) => {
    const record = records[idx];
    return {
      id: record.id,
      vector: allVectors[i],
      filePath: record.filePath,
      module: record.module,
      name: record.name,
      signature: record.signature,
      summary: record.docstring?.summary || "",
      tags: record.docstring?.tags.length ? `,${record.docstring.tags.join(",")},` : "",
      sideEffects: record.docstring?.sideEffects.length ? `,${record.docstring.sideEffects.join(",")},` : "",
      chunkText: chunks[idx],
    };
  });

  await vectorDb.upsert(rows);
}
