import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { embedText, isInitialized as embeddingsInitialized } from '../lib/embeddings.js'
import {
  queryIndex,
  getFolderIndexName,
  getFileIndexName,
  isInitialized as pineconeInitialized,
} from '../lib/pinecone.js'
import { readFileContent } from '../functions/readFileContent.js'

interface SemanticFolderResult {
  folderId: string
  name: string
  path: string
  score: number
}

interface SemanticFileResult {
  fileId: string
  name: string
  folderId: string
  folderName?: string
  score: number
}

interface SemanticQueryResult {
  folders: SemanticFolderResult[]
  files: SemanticFileResult[]
  content?: Array<{
    fileId: string
    fileName: string
    content: string
    isTruncated?: boolean
  }>
}

/**
 * Register semantic_search_folders tool
 */
export function registerSemanticSearchFoldersTool(server: McpServer): void {
  server.tool(
    'semantic_search_folders',
    'Searches Google Drive folders using semantic similarity. This is the preferred method for finding folders by natural language query. Returns top matching folders with relevance scores. Always use this before searching for files.',
    {
      query: z.string().describe('Natural language query describing the folder you want to find (e.g., "DSA questions", "college notes", "project documents")'),
      topK: z.number().optional().default(5).describe('Number of top results to return (default: 5)'),
    },
    async ({ query, topK = 5 }) => {
      try {

        if (!query || typeof query !== 'string') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Query is required' }, null, 2),
              },
            ],
            isError: true,
          }
        }

        // Check if embeddings are initialized
        if (!embeddingsInitialized()) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Semantic search not available. Please configure GEMINI_API_KEY and run indexing.',
                }, null, 2),
              },
            ],
            isError: true,
          }
        }

        // Generate embedding for query
        const queryEmbedding = await embedText(query)

        // Search Pinecone folder index
        const results = await queryIndex(getFolderIndexName(), queryEmbedding, topK)

        const folders: SemanticFolderResult[] = results.map((result) => ({
          folderId: result.id,
          name: (result.metadata.name as string) || '',
          path: (result.metadata.path as string) || '',
          score: result.score,
        }))

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ folders }, null, 2),
            },
          ],
        }
      } catch (error: any) {
        console.error('Error in semantic_search_folders:', error)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { error: `Failed to search folders: ${error.message || error}` },
                null,
                2
              ),
            },
          ],
          isError: true,
        }
      }
    }
  )
}

/**
 * Register semantic_search_files tool
 */
export function registerSemanticSearchFilesTool(server: McpServer): void {
  server.tool(
    'semantic_search_files',
    'Searches files within specific folders using semantic similarity. Use this after finding relevant folders with semantic_search_folders. Returns top matching files with relevance scores.',
    {
      folderIds: z.array(z.string()).describe('Array of folder IDs to search within'),
      query: z.string().describe('Natural language query describing the file you want to find'),
      topK: z.number().optional().default(3).describe('Number of top results to return per folder (default: 3)'),
    },
    async ({ folderIds, query, topK = 3 }) => {
      try {

        // Check if embeddings are initialized
        if (!embeddingsInitialized()) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Semantic search not available. Please configure GEMINI_API_KEY and run indexing.',
                }, null, 2),
              },
            ],
            isError: true,
          }
        }

        // Generate embedding for query
        const queryEmbedding = await embedText(query)

        // Search files in each folder
        const allFiles: SemanticFileResult[] = []

        for (const folderId of folderIds) {
          try {
            const results = await queryIndex(
              getFileIndexName(),
              queryEmbedding,
              topK,
              {
                folderId: { $eq: folderId },
              }
            )

            const files: SemanticFileResult[] = results.map((result) => ({
              fileId: result.id,
              name: (result.metadata.name as string) || '',
              folderId: (result.metadata.folderId as string) || folderId,
              folderName: (result.metadata.folderName as string) || undefined,
              score: result.score,
            }))

            allFiles.push(...files)
          } catch (error) {
            console.error(`Error searching files in folder ${folderId}:`, error)
          }
        }

        // Sort by score and return top results
        allFiles.sort((a, b) => b.score - a.score)
        const topFiles = allFiles.slice(0, topK * folderIds.length)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ files: topFiles }, null, 2),
            },
          ],
        }
      } catch (error: any) {
        console.error('Error in semantic_search_files:', error)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { error: `Failed to search files: ${error.message || error}` },
                null,
                2
              ),
            },
          ],
          isError: true,
        }
      }
    }
  )
}

/**
 * Register semantic_drive_query tool (orchestrator)
 */
export function registerSemanticDriveQueryTool(server: McpServer): void {
  server.tool(
    'semantic_drive_query',
    'Primary tool for semantic search across Google Drive. This is the recommended entry point for finding files by natural language query. It automatically: 1) Finds relevant folders, 2) Searches files within those folders, 3) Reads the top matching file contents. Always use this tool first when searching for files or information in Drive. Falls back to individual tools if needed.',
    {
      query: z.string().describe('Natural language query describing what you want to find (e.g., "find a file which contains DSA questions", "show me notes about machine learning", "where are my project documents")'),
      maxFolders: z.number().optional().default(2).describe('Maximum number of folders to search (default: 2)'),
      maxFiles: z.number().optional().default(3).describe('Maximum number of files to read (default: 3)'),
      includeContent: z.boolean().optional().default(true).describe('Whether to include file contents in response (default: true)'),
    },
    async ({ query, maxFolders = 2, maxFiles = 3, includeContent = true }) => {
      try {

        // Check if embeddings and Pinecone are initialized
        if (!embeddingsInitialized() || !pineconeInitialized()) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Semantic search not available. Please configure PINECONE_API_KEY, GEMINI_API_KEY and run indexing.',
                  suggestion: 'Use list-all-folders and list-files-in-folder tools instead.',
                }, null, 2),
              },
            ],
            isError: true,
          }
        }

        // Step 1: Generate embedding for query
        const queryEmbedding = await embedText(query)

        // Step 2: Search folders
        const folderResults = await queryIndex(
          getFolderIndexName(),
          queryEmbedding,
          maxFolders
        )

        const folders: SemanticFolderResult[] = folderResults.map((result) => ({
          folderId: result.id,
          name: (result.metadata.name as string) || '',
          path: (result.metadata.path as string) || '',
          score: result.score,
        }))

        if (folders.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    folders: [],
                    files: [],
                    message: 'No matching folders found',
                  },
                  null,
                  2
                ),
              },
            ],
          }
        }

        // Step 3: Search files in top folders
        const folderIds = folders.map((f) => f.folderId)
        const allFiles: SemanticFileResult[] = []

        for (const folderId of folderIds) {
          try {
            const fileResults = await queryIndex(
              getFileIndexName(),
              queryEmbedding,
              maxFiles,
              {
                folderId: { $eq: folderId },
              }
            )

            const files: SemanticFileResult[] = fileResults.map((result) => ({
              fileId: result.id,
              name: (result.metadata.name as string) || '',
              folderId: (result.metadata.folderId as string) || folderId,
              folderName: (result.metadata.folderName as string) || undefined,
              score: result.score,
            }))

            allFiles.push(...files)
          } catch (error) {
            console.error(`Error searching files in folder ${folderId}:`, error)
          }
        }

        // Sort by score and get top files
        allFiles.sort((a, b) => b.score - a.score)
        const topFiles = allFiles.slice(0, maxFiles)

        // Step 4: Read file contents if requested
        const content: Array<{
          fileId: string
          fileName: string
          content: string
          isTruncated?: boolean
        }> = []

        if (includeContent && topFiles.length > 0) {
          for (const file of topFiles) {
            try {
              const contentResult = await readFileContent(file.fileId)
              if (contentResult.success && contentResult.content) {
                content.push({
                  fileId: file.fileId,
                  fileName: file.name,
                  content: contentResult.content,
                  isTruncated: contentResult.isTruncated,
                })
              }
            } catch (error) {
              console.error(`Error reading content for file ${file.name}:`, error)
            }
          }
        }

        const result: SemanticQueryResult = {
          folders,
          files: topFiles,
          content: includeContent ? content : undefined,
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      } catch (error: any) {
        console.error('Error in semantic_drive_query:', error)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { error: `Failed to execute semantic query: ${error.message || error}` },
                null,
                2
              ),
            },
          ],
          isError: true,
        }
      }
    }
  )
}

