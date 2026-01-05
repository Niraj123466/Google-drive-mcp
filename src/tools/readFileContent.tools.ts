import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { readFileContent } from '../functions/readFileContent.js'

export function registerReadFileContentTool(server: McpServer) {
  server.tool(
    'read-file-content',
    'Reads and returns the textual content of a file in the client’s Google Drive. For Google Docs/Sheets/Slides it exports as plain text; for non-text files it returns an explanatory error.',
    {
      fileId: z.string().describe('The ID of the file to read the contents of'),
    },
    async ({ fileId }) => {
      const result = await readFileContent(fileId)

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text:
                result.message ??
                'Failed to read the requested file. Please check the file ID and try again.',
            },
          ],
          isError: true,
        }
      }

      const headerLines = [
        `File: ${result.fileName || 'unknown'}`,
        `MIME type: ${result.mimeType || 'unknown'}`,
        result.isTruncated
          ? 'Note: Content truncated for length.'
          : undefined,
        '',
        '',
      ].filter(Boolean)

      const header = headerLines.join('\n')

      return {
        content: [
          {
            type: 'text',
            text: `${header}${result.content ?? ''}`,
          },
        ],
      }
    }
  )
}


