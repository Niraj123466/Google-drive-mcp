import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerListAllFoldersTool } from './listAllFolders.tools.js'
import { registerListFilesInFolderTool } from './listFilesInFolder.tools.js'
import { registerReturnFileTool } from './returnFile.tools.js'
import { registerReadFileContentTool } from './readFileContent.tools.js'
import {
  registerSemanticSearchFoldersTool,
  registerSemanticSearchFilesTool,
  registerSemanticDriveQueryTool,
} from './semantic.tools.js'

export function registerAllTools(server: McpServer) {
  // Existing tools (backward compatible)
  registerListAllFoldersTool(server)
  registerListFilesInFolderTool(server)
  registerReturnFileTool(server)
  registerReadFileContentTool(server)
  
  // New semantic search tools
  registerSemanticSearchFoldersTool(server)
  registerSemanticSearchFilesTool(server)
  registerSemanticDriveQueryTool(server)
}
