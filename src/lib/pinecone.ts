import { Pinecone } from '@pinecone-database/pinecone'
import 'dotenv/config'

type Metadata = Record<string, any>

interface PineconeConfig {
  apiKey: string
  indexFolders: string
  indexFiles: string
}

interface VectorRecord {
  id: string
  values: number[]
  metadata: Metadata
}

let pineconeClient: Pinecone | null = null
let config: PineconeConfig | null = null

/**
 * Initialize Pinecone client
 */
export async function initPinecone(
  apiKey: string,
  indexFolders: string,
  indexFiles: string
): Promise<void> {
  if (pineconeClient) {
    console.log('Pinecone already initialized')
    return
  }

  config = { apiKey, indexFolders, indexFiles }

  // ✅ Latest Pinecone SDK — no environment needed
  pineconeClient = new Pinecone({
    apiKey,
  })

  console.log('Pinecone initialized successfully')
}

/**
 * Get Pinecone client instance
 */
function getClient(): Pinecone {
  if (!pineconeClient) {
    throw new Error('Pinecone not initialized. Call initPinecone first.')
  }
  return pineconeClient
}

/**
 * Resolve correct host per index
 */
function getIndex(indexName: string) {
  if (!config) {
    throw new Error('Pinecone not initialized')
  }

  let host: string | undefined

  if (indexName === config.indexFolders) {
    host = process.env.PINECONE_FOLDERS_HOST
  } else if (indexName === config.indexFiles) {
    host = process.env.PINECONE_FILES_HOST
  }

  if (!host) {
    throw new Error(`Missing Pinecone host for index: ${indexName}`)
  }

  return getClient().index(indexName, host)
}

/**
 * Upsert vectors to Pinecone index
 */
export async function upsertVectors(
  indexName: string,
  vectors: VectorRecord[],
  namespace?: string
): Promise<void> {
  try {
    const index = getIndex(indexName)
    const namespaceIndex = namespace ? index.namespace(namespace) : index

    const batchSize = 100
    for (let i = 0; i < vectors.length; i += batchSize) {
      await namespaceIndex.upsert(vectors.slice(i, i + batchSize))
    }

    console.log(`Upserted ${vectors.length} vectors to index ${indexName}`)
  } catch (error) {
    console.error(`Error upserting vectors to ${indexName}:`, error)
    throw error
  }
}

/**
 * Query Pinecone index
 */
export async function queryIndex(
  indexName: string,
  queryVector: number[],
  topK: number = 10,
  filter?: any,
  namespace?: string
): Promise<Array<{ id: string; score: number; metadata: Metadata }>> {
  try {
    const index = getIndex(indexName)
    const namespaceIndex = namespace ? index.namespace(namespace) : index

    const queryResponse = await namespaceIndex.query({
      vector: queryVector,
      topK,
      includeMetadata: true,
      filter,
    })

    return (queryResponse.matches || []).map((match) => ({
      id: match.id || '',
      score: match.score || 0,
      metadata: match.metadata || {},
    }))
  } catch (error) {
    console.error(`Error querying index ${indexName}:`, error)
    throw error
  }
}

/**
 * Delete vectors from Pinecone index
 */
export async function deleteVectors(
  indexName: string,
  ids: string[],
  namespace?: string
): Promise<void> {
  try {
    const index = getIndex(indexName)
    const namespaceIndex = namespace ? index.namespace(namespace) : index

    await namespaceIndex.deleteMany(ids)
    console.log(`Deleted ${ids.length} vectors from index ${indexName}`)
  } catch (error) {
    console.error(`Error deleting vectors from ${indexName}:`, error)
    throw error
  }
}

/**
 * Get folder index name
 */
export function getFolderIndexName(): string {
  if (!config) {
    throw new Error('Pinecone not initialized')
  }
  return config.indexFolders
}

/**
 * Get file index name
 */
export function getFileIndexName(): string {
  if (!config) {
    throw new Error('Pinecone not initialized')
  }
  return config.indexFiles
}

/**
 * Check if Pinecone is initialized
 */
export function isInitialized(): boolean {
  return pineconeClient !== null && config !== null
}