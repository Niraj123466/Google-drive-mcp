import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerAllTools } from './tools/index.js'
import { initPinecone } from './lib/pinecone.js'
import { initEmbeddings } from './lib/embeddings.js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const server = new McpServer({
  name: 'Google Drive',
  version: '1.0.0',
})

// Register all tools
registerAllTools(server)

async function main() {
  // Initialize Pinecone if configured
  const pineconeApiKey = process.env.PINECONE_API_KEY
  const pineconeIndexFolders = process.env.PINECONE_INDEX_FOLDERS || 'drive-folders'
  const pineconeIndexFiles = process.env.PINECONE_INDEX_FILES || 'drive-files'

  if (pineconeApiKey) {
    try {
      await initPinecone(pineconeApiKey, pineconeIndexFolders, pineconeIndexFiles)
      console.error('Pinecone initialized successfully')
    } catch (error) {
      console.error('Warning: Failed to initialize Pinecone:', error)
      console.error('Semantic search tools will not be available')
    }
  } else {
    console.error('Warning: PINECONE_API_KEY not set. Semantic search tools will not be available.')
  }

  // Initialize embeddings if configured
  const geminiApiKey = process.env.GEMINI_API_KEY
  const embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-004'

  if (geminiApiKey) {
    try {
      initEmbeddings(geminiApiKey, embeddingModel)
      console.error('Gemini embeddings initialized successfully')
    } catch (error) {
      console.error('Warning: Failed to initialize embeddings:', error)
      console.error('Semantic search tools will not be available')
    }
  } else {
    console.error('Warning: GEMINI_API_KEY not set. Semantic search tools will not be available.')
  }

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Google Drive MCP Server running on stdio')
}

main().catch((err) => {
  console.error('MCP Server failed to start:', err)
  process.exit(1)
})
