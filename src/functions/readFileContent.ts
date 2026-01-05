import { drive } from '../google/googleClient.js'

interface FileContentResult {
  success: boolean
  content?: string
  fileName?: string | null | undefined
  mimeType?: string | null | undefined
  isTruncated?: boolean
  message?: string
}

const MAX_CONTENT_LENGTH = 100_000

// MIME types that are text-based and can be read directly
const TEXT_MIME_TYPES = [
  'text/',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/x-sh',
  'application/x-bash',
  'application/x-python',
  'application/x-yaml',
  'application/x-toml',
  'application/csv',
  'text/csv',
  'application/x-csv',
]

// MIME types that are binary and cannot be read as text
const BINARY_MIME_TYPES = [
  'image/',
  'video/',
  'audio/',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
]

// Office file MIME types - these need to be converted to Google Workspace format first
// Note: Google Drive export API only works for Google Workspace files, not native Office files
const OFFICE_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/msword', // .doc
  'application/vnd.ms-excel', // .xls
  'application/vnd.ms-powerpoint', // .ppt
]

function isTextMimeType(mimeType: string): boolean {
  return TEXT_MIME_TYPES.some((type) => mimeType.startsWith(type))
}

function isBinaryMimeType(mimeType: string): boolean {
  return BINARY_MIME_TYPES.some((type) => mimeType.startsWith(type))
}

function isOfficeMimeType(mimeType: string): boolean {
  return OFFICE_MIME_TYPES.includes(mimeType)
}

function canExportToText(mimeType: string): boolean {
  // Only Google Workspace files can be exported
  return mimeType.startsWith('application/vnd.google-apps.')
}

function getExportMimeType(mimeType: string): string {
  // Google Workspace files can be exported to text/plain
  if (mimeType.startsWith('application/vnd.google-apps.')) {
    return 'text/plain'
  }
  return 'text/plain'
}

export const readFileContent = async (
  fileId: string
): Promise<FileContentResult> => {
  try {
    const metaRes = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType',
    })

    const file = metaRes.data

    if (!file?.id) {
      return {
        success: false,
        message: 'File not found or inaccessible.',
      }
    }

    const mimeType = file.mimeType || ''

    // Check if file is binary and cannot be read as text
    if (isBinaryMimeType(mimeType)) {
      return {
        success: false,
        message: `Cannot read binary file content as text. File type: ${mimeType}. Use the download link tool instead.`,
      }
    }

    // Check if file is a native Office file (not converted to Google Workspace format)
    // These cannot be read directly - they need to be converted to Google Workspace format first
    if (isOfficeMimeType(mimeType)) {
      return {
        success: false,
        message: `Cannot read native Office file content directly. Please convert the file to Google Workspace format (Google Docs/Sheets/Slides) first, or use the download link tool to download the file. File type: ${mimeType}`,
      }
    }

    let rawContent: string

    // Handle Google Workspace files that can be exported
    if (canExportToText(mimeType)) {
      try {
        const exportMimeType = getExportMimeType(mimeType)
        const exportRes = await drive.files.export(
          {
            fileId,
            mimeType: exportMimeType,
          },
          {
            responseType: 'arraybuffer',
          }
        )

        // Convert ArrayBuffer to string (UTF-8)
        const buffer = Buffer.from(exportRes.data as ArrayBuffer)
        rawContent = buffer.toString('utf-8')
      } catch (exportError: any) {
        // If export fails, try to get more specific error info
        const errorMessage =
          exportError?.message || 'Failed to export file to text format'
        return {
          success: false,
          message: `Cannot convert file to text format: ${errorMessage}. MIME type: ${mimeType}`,
        }
      }
    } else if (isTextMimeType(mimeType)) {
      // Handle text-based files
      try {
        const getRes = await drive.files.get(
          {
            fileId,
            alt: 'media',
          },
          {
            responseType: 'arraybuffer',
          }
        )

        // Convert ArrayBuffer to string (UTF-8)
        const buffer = Buffer.from(getRes.data as ArrayBuffer)
        rawContent = buffer.toString('utf-8')
      } catch (getError: any) {
        return {
          success: false,
          message: `Failed to read file content: ${getError?.message || getError}. MIME type: ${mimeType}`,
        }
      }
    } else {
      // Unknown MIME type - try to read as text but warn user
      try {
        const getRes = await drive.files.get(
          {
            fileId,
            alt: 'media',
          },
          {
            responseType: 'arraybuffer',
          }
        )

        // Convert ArrayBuffer to string (UTF-8)
        const buffer = Buffer.from(getRes.data as ArrayBuffer)
        rawContent = buffer.toString('utf-8')

        // Check if content looks like binary (contains null bytes or non-printable characters)
        // Allow common text control characters like newlines, tabs, etc.
        if (
          rawContent.includes('\0') ||
          /[\x00-\x08\x0E-\x1F\x7F-\x9F]/.test(rawContent)
        ) {
          // Check if it's mostly binary (more than 5% non-printable characters)
          const nonPrintableCount = (
            rawContent.match(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g) || []
          ).length
          if (nonPrintableCount > rawContent.length * 0.05) {
            return {
              success: false,
              message: `File appears to be binary or non-textual. MIME type: ${mimeType}. Cannot read as text.`,
            }
          }
        }
      } catch (getError: any) {
        return {
          success: false,
          message: `Cannot read file content. File may be binary or in an unsupported format. MIME type: ${mimeType}. Error: ${getError?.message || getError}`,
        }
      }
    }

    // Truncate if too long
    let content = rawContent
    let isTruncated = false

    if (content.length > MAX_CONTENT_LENGTH) {
      content = `${content.slice(
        0,
        MAX_CONTENT_LENGTH
      )}\n\n...[truncated for length]`
      isTruncated = true
    }

    return {
      success: true,
      content,
      fileName: file.name,
      mimeType,
      isTruncated,
    }
  } catch (error: any) {
    console.error('Error reading file content:', error)
    return {
      success: false,
      message: `Error reading file content: ${error?.message || error}`,
    }
  }
}


