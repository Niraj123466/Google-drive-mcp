import { drive } from '../google/googleClient.js'
import { listAllFolders } from '../functions/listAllFolders.js'
import { listFilesInFolder } from '../functions/listFilesInFolder.js'
import { readFileContent } from '../functions/readFileContent.js'
import { embedText, embedTexts } from '../lib/embeddings.js'
import {
  upsertVectors,
  getFolderIndexName,
  getFileIndexName,
} from '../lib/pinecone.js'

type Metadata = Record<string, any>

interface FolderMetadata extends Metadata {
  type: 'folder'
  name: string
  path: string
  summary: string
  fileNames: string
  lastSynced: string
}

interface FileMetadata extends Metadata {
  type: 'file'
  name: string
  folderId: string
  folderName?: string
  mimeType: string
  previewText: string
  lastSynced: string
}

const PREVIEW_TEXT_LENGTH = 5000 // 5KB preview
const MAX_FILE_PREVIEW_LENGTH = 2000 // 2KB for folder summary

/**
 * Build semantic text representation for a folder
 */
async function buildFolderSemanticText(
  folderId: string,
  folderName: string,
  folderPath: string
): Promise<{ text: string; fileNames: string[] }> {
  try {
    // Get all files in folder
    const filesResponse = await listFilesInFolder(folderId)
    const files = filesResponse.files || []
    const fileNames = files.map((f) => f.name || '').filter(Boolean)

    // Build preview text from first few files
    let previewText = ''
    const filesToPreview = files.slice(0, 5) // Preview first 5 files

    for (const file of filesToPreview) {
      if (!file.id) continue

      try {
        const contentResult = await readFileContent(file.id)
        if (contentResult.success && contentResult.content) {
          const preview = contentResult.content
            .slice(0, MAX_FILE_PREVIEW_LENGTH)
            .replace(/\s+/g, ' ')
            .trim()
          previewText += `${file.name}: ${preview}\n`
        }
      } catch (error) {
        // Skip files that can't be read
        console.log(`Skipping preview for file ${file.name}: ${error}`)
      }
    }

    // Build semantic text
    const semanticText = [
      `Folder: ${folderName}`,
      `Path: ${folderPath}`,
      `Files: ${fileNames.join(', ')}`,
      previewText ? `Content preview:\n${previewText}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    return { text: semanticText, fileNames }
  } catch (error) {
    console.error(`Error building folder semantic text for ${folderName}:`, error)
    // Return basic info even if preview fails
    return {
      text: `Folder: ${folderName}\nPath: ${folderPath}`,
      fileNames: [],
    }
  }
}

/**
 * Build semantic text representation for a file
 */
async function buildFileSemanticText(
  fileId: string,
  fileName: string,
  folderId: string,
  folderName: string,
  mimeType: string
): Promise<string> {
  try {
    // Get preview text from file
    let previewText = ''
    const contentResult = await readFileContent(fileId)

    if (contentResult.success && contentResult.content) {
      previewText = contentResult.content
        .slice(0, PREVIEW_TEXT_LENGTH)
        .replace(/\s+/g, ' ')
        .trim()
    }

    // Build semantic text
    const semanticText = [
      `File: ${fileName}`,
      `Folder: ${folderName}`,
      `Type: ${mimeType}`,
      previewText ? `Content:\n${previewText}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    return semanticText
  } catch (error) {
    console.error(`Error building file semantic text for ${fileName}:`, error)
    // Return basic info even if content read fails
    return `File: ${fileName}\nFolder: ${folderName}\nType: ${mimeType}`
  }
}

/**
 * Index a single folder
 */
export async function indexFolder(
  folderId: string,
  folderName: string,
  folderPath: string
): Promise<void> {
  try {
    const { text: semanticText, fileNames } = await buildFolderSemanticText(
      folderId,
      folderName,
      folderPath
    )

    // Generate embedding
    const embedding = await embedText(semanticText)

    // Prepare metadata
    const metadata: FolderMetadata = {
      type: 'folder',
      name: folderName,
      path: folderPath,
      summary: semanticText.slice(0, 1000), // Store summary in metadata
      fileNames: fileNames.join(', '),
      lastSynced: new Date().toISOString(),
    }

    // Upsert to Pinecone
    await upsertVectors(getFolderIndexName(), [
      {
        id: folderId,
        values: embedding,
        metadata,
      },
    ])

    console.log(`Indexed folder: ${folderName} (${folderId})`)
  } catch (error) {
    console.error(`Error indexing folder ${folderName}:`, error)
    throw error
  }
}

/**
 * Index a single file
 */
export async function indexFile(
  fileId: string,
  fileName: string,
  folderId: string,
  folderName: string,
  mimeType: string
): Promise<void> {
  try {
    const semanticText = await buildFileSemanticText(
      fileId,
      fileName,
      folderId,
      folderName,
      mimeType
    )

    // Generate embedding
    const embedding = await embedText(semanticText)

    // Prepare metadata
    const metadata: FileMetadata = {
      type: 'file',
      name: fileName,
      folderId,
      folderName,
      mimeType,
      previewText: semanticText.slice(0, 2000), // Store preview in metadata
      lastSynced: new Date().toISOString(),
    }

    // Upsert to Pinecone
    await upsertVectors(getFileIndexName(), [
      {
        id: fileId,
        values: embedding,
        metadata,
      },
    ])

    console.log(`Indexed file: ${fileName} (${fileId})`)
  } catch (error) {
    console.error(`Error indexing file ${fileName}:`, error)
    throw error
  }
}

/**
 * Get folder path by traversing parent folders
 */
async function getFolderPath(folderId: string): Promise<string> {
  try {
    const path: string[] = []
    let currentId: string | null = folderId

    while (currentId) {
      const folderRes: any = await drive.files.get({
        fileId: currentId,
        fields: 'id, name, parents',
      })

      const folder: any = folderRes.data
      if (folder.name) {
        path.unshift(folder.name)
      }

      // Get parent folder
      if (folder.parents && folder.parents.length > 0) {
        currentId = folder.parents[0]
      } else {
        break
      }
    }

    return '/' + path.join('/')
  } catch (error) {
    console.error(`Error getting folder path for ${folderId}:`, error)
    return '/'
  }
}

/**
 * Index all folders in Drive
 */
export async function indexAllFolders(): Promise<void> {
  try {
    console.log('Starting folder indexing...')
    const foldersResponse = await listAllFolders()

    if (!foldersResponse.success || !foldersResponse.folders) {
      throw new Error('Failed to list folders')
    }

    const folders = foldersResponse.folders
    console.log(`Found ${folders.length} folders to index`)

    // Process folders in batches
    const batchSize = 10
    for (let i = 0; i < folders.length; i += batchSize) {
      const batch = folders.slice(i, i + batchSize)
      
      await Promise.all(
        batch.map(async (folder) => {
          if (!folder.id || !folder.name) return
          
          try {
            const path = await getFolderPath(folder.id)
            await indexFolder(folder.id, folder.name, path)
          } catch (error) {
            console.error(`Failed to index folder ${folder.name}:`, error)
          }
        })
      )

      console.log(`Indexed ${Math.min(i + batchSize, folders.length)}/${folders.length} folders`)
      
      // Small delay between batches
      if (i + batchSize < folders.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    console.log('Folder indexing completed')
  } catch (error) {
    console.error('Error indexing folders:', error)
    throw error
  }
}

/**
 * Index all files in a specific folder
 */
export async function indexFilesInFolder(folderId: string, folderName: string): Promise<void> {
  try {
    const filesResponse = await listFilesInFolder(folderId)

    if (!filesResponse.success || !filesResponse.files) {
      console.log(`No files found in folder ${folderName}`)
      return
    }

    const files = filesResponse.files
    console.log(`Indexing ${files.length} files in folder ${folderName}`)

    // Get file metadata including MIME type
    const fileDetails = await Promise.all(
      files.map(async (file) => {
        if (!file.id) return null
        try {
          const metaRes = await drive.files.get({
            fileId: file.id,
            fields: 'id, name, mimeType',
          })
          return {
            id: file.id,
            name: file.name || '',
            mimeType: metaRes.data.mimeType || 'unknown',
          }
        } catch (error) {
          console.error(`Error getting metadata for file ${file.name}:`, error)
          return null
        }
      })
    )

    const validFiles = fileDetails.filter((f): f is NonNullable<typeof f> => f !== null)

    // Process files in batches
    const batchSize = 5
    for (let i = 0; i < validFiles.length; i += batchSize) {
      const batch = validFiles.slice(i, i + batchSize)
      
      await Promise.all(
        batch.map(async (file) => {
          try {
            await indexFile(file.id, file.name, folderId, folderName, file.mimeType)
          } catch (error) {
            console.error(`Failed to index file ${file.name}:`, error)
          }
        })
      )

      console.log(`Indexed ${Math.min(i + batchSize, validFiles.length)}/${validFiles.length} files in ${folderName}`)
      
      // Delay between batches to avoid rate limits
      if (i + batchSize < validFiles.length) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }

    console.log(`Completed indexing files in folder ${folderName}`)
  } catch (error) {
    console.error(`Error indexing files in folder ${folderName}:`, error)
    throw error
  }
}

/**
 * Full sync: index all folders and their files
 */
export async function fullSync(): Promise<void> {
  try {
    console.log('Starting full Drive sync...')
    
    // First, index all folders
    await indexAllFolders()
    
    // Then, get folders again and index their files
    const foldersResponse = await listAllFolders()
    if (!foldersResponse.success || !foldersResponse.folders) {
      throw new Error('Failed to list folders for file indexing')
    }

    const folders = foldersResponse.folders
    console.log(`Indexing files in ${folders.length} folders...`)

    for (const folder of folders) {
      if (!folder.id || !folder.name) continue
      
      try {
        await indexFilesInFolder(folder.id, folder.name)
      } catch (error) {
        console.error(`Failed to index files in folder ${folder.name}:`, error)
      }
      
      // Delay between folders
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    console.log('Full sync completed')
  } catch (error) {
    console.error('Error during full sync:', error)
    throw error
  }
}

