#!/usr/bin/env node
/**
 * Script to index Google Drive for semantic search
 * 
 * Usage:
 *   npm run index:drive          # Full sync
 *   npm run index:folders        # Index folders only
 *   npm run index:folder <id>    # Index specific folder and its files
 */

import dotenv from 'dotenv'
import { initPinecone } from '../lib/pinecone.js'
import { initEmbeddings } from '../lib/embeddings.js'
import {
  fullSync,
  indexAllFolders,
  indexFilesInFolder,
} from '../services/driveSemanticIndexer.js'
import { drive } from '../google/googleClient.js'

dotenv.config()

async function main() {
  const command = process.argv[2]
  const arg = process.argv[3]

  // Initialize Pinecone
  const pineconeApiKey = process.env.PINECONE_API_KEY
  const pineconeIndexFolders = process.env.PINECONE_INDEX_FOLDERS || 'drive-folders'
  const pineconeIndexFiles = process.env.PINECONE_INDEX_FILES || 'drive-files'

  if (!pineconeApiKey) {
    console.error('Error: PINECONE_API_KEY not set in environment')
    process.exit(1)
  }

  try {
    await initPinecone(pineconeApiKey, pineconeIndexFolders, pineconeIndexFiles)
    console.log('✓ Pinecone initialized')
  } catch (error) {
    console.error('Error initializing Pinecone:', error)
    process.exit(1)
  }

  // Initialize embeddings
  const geminiApiKey = process.env.GEMINI_API_KEY
  const embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-004'

  if (!geminiApiKey) {
    console.error('Error: GEMINI_API_KEY not set in environment')
    process.exit(1)
  }

  try {
    initEmbeddings(geminiApiKey, embeddingModel)
    console.log('✓ Gemini embeddings initialized')
  } catch (error) {
    console.error('Error initializing embeddings:', error)
    process.exit(1)
  }

  // Execute command
  try {
    switch (command) {
      case 'full':
      case 'sync':
        console.log('\n🔄 Starting full Drive sync...')
        await fullSync()
        console.log('\n✅ Full sync completed!')
        break

      case 'folders':
        console.log('\n📁 Indexing all folders...')
        await indexAllFolders()
        console.log('\n✅ Folder indexing completed!')
        break

      case 'folder':
        if (!arg) {
          console.error('Error: Folder ID required')
          console.log('Usage: npm run index:folder <folderId>')
          process.exit(1)
        }

        // Get folder name
        try {
          const folderRes = await drive.files.get({
            fileId: arg,
            fields: 'id, name',
          })
          const folderName = folderRes.data.name || arg

          console.log(`\n📁 Indexing folder: ${folderName}`)
          await indexFilesInFolder(arg, folderName)
          console.log(`\n✅ Folder indexing completed!`)
        } catch (error) {
          console.error(`Error indexing folder ${arg}:`, error)
          process.exit(1)
        }
        break

      default:
        console.log(`
Usage:
  npm run index:drive          # Full sync (folders + files)
  npm run index:folders        # Index folders only
  npm run index:folder <id>    # Index specific folder and its files

Environment variables required:
  PINECONE_API_KEY
  GEMINI_API_KEY
  PINECONE_INDEX_FOLDERS (optional, default: drive-folders)
  PINECONE_INDEX_FILES (optional, default: drive-files)
  EMBEDDING_MODEL (optional, default: text-embedding-004)
        `)
        process.exit(1)
    }
  } catch (error) {
    console.error('\n❌ Error during indexing:', error)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})

