# Google Drive MCP

This project connects Claude Desktop to your Google Drive via the Model Context Protocol (MCP), allowing Claude to access and interact with your Drive files and folders securely.

## Setup and Usage

Follow these steps in order to get the app running:

1. **Get Google OAuth Credentials**

   - Go to the [Google Cloud Console Credentials page](https://console.cloud.google.com/apis/credentials) to create a project and enable the Google Drive API.
   - Create **OAuth 2.0 Client IDs** credentials with application type **Desktop app**.
   - Note your **Client ID**, **Client Secret**, and set your **Redirect URI** to `http://localhost:3000`.

2. **Create a `.env` File**

   In the root of your project, create a `.env` file and add the following variables:

```
CLIENT_ID=your-client-id-here
CLIENT_SECRET=your-client-secret-here
REDIRECT_URI=http://localhost:3000
```

3. **Install Dependencies**

```
npm install
```

4. **Generate Google API Token**

```
npm run tokenGenerator
```

This will open a browser to authenticate with Google and save a token.json file in your project root.

5. **Build the project**

```
npm run build
```

6. **Install Claude Desktop (if not already installed)**
   
   Download and install Claude Desktop from https://claude.ai/download.

7. **Configure Claude Desktop MCP Servers**

   In a text editor open the Claude Desktop config file at:

   macOS/Linux:
   ```
   ~/Library/Application Support/Claude/claude_desktop_config.json
   ```

   Windows:
   ```
   %APPDATA%\Claude\claude_desktop_config.json
   ```

Add the following MCP server configuration, adjusting the path to your build output and environment variables accordingly:

```
{
  "mcpServers": {
    "googleDrive": {
      "command": "node",
      "args": ["path/to/your/build/index.js"],
      "env": {
        "CLIENT_ID": "your-actual-client-id",
        "CLIENT_SECRET": "your-actual-client-secret",
        "REDIRECT_URI": "http://localhost:3000"
      }
    }
  }
}
```
Save the file

8. **Restart Claude Desktop**

## Semantic Search (Optional but Recommended)

The MCP server now supports semantic search using Pinecone and OpenAI embeddings, enabling fast, accurate file discovery through natural language queries.

### Benefits

- **Fast**: Searches only relevant folders/files instead of scanning entire Drive
- **Accurate**: Uses semantic similarity to understand query intent
- **Cost-effective**: Reduces API calls by targeting specific content
- **Natural**: Works with queries like "find DSA questions" or "show me machine learning notes"

### Setup Semantic Search

1. **Get API Keys**

   - **Pinecone**: Sign up at [pinecone.io](https://www.pinecone.io/) and create an index
   - **Google Gemini**: Get API key from [makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey) or [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

2. **Create Pinecone Indexes**

   Create two indexes in Pinecone:
   - `drive-folders` (or your preferred name)
   - `drive-files` (or your preferred name)
   
   Both should use:
   - **Dimensions**: 768 (for `text-embedding-004`) or 3072 (for `gemini-embedding-001` or `gemini-embedding-exp-03-07`)
   - **Metric**: cosine
   
   **Note**: 
   - `text-embedding-004` (768 dimensions) - Recommended for most use cases, cost-effective
   - `gemini-embedding-001` (3072 dimensions) - Latest model, supports 100+ languages, better quality
   - `gemini-embedding-exp-03-07` (3072 dimensions) - Experimental model

3. **Update `.env` File**

   Add these variables to your `.env` file:

```
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_INDEX_FOLDERS=drive-folders
PINECONE_INDEX_FILES=drive-files
GEMINI_API_KEY=your-gemini-api-key
EMBEDDING_MODEL=text-embedding-004
```
```

4. **Index Your Drive**

   Run one of these commands to index your Drive:

```bash
# Full sync (recommended for first time)
npm run index:drive

# Index folders only
npm run index:folders

# Index specific folder and its files
npm run index:folder <folderId>
```

   **Note**: Initial indexing may take time depending on Drive size. The system processes files in batches to avoid rate limits.

5. **Update MCP Configuration**

   Add the new environment variables to your Claude Desktop config:

```json
{
  "mcpServers": {
    "googleDrive": {
      "command": "node",
      "args": ["path/to/your/build/index.js"],
      "env": {
        "CLIENT_ID": "your-actual-client-id",
        "CLIENT_SECRET": "your-actual-client-secret",
        "REDIRECT_URI": "http://localhost:3000",
        "PINECONE_API_KEY": "your-pinecone-api-key",
        "PINECONE_INDEX_FOLDERS": "drive-folders",
        "PINECONE_INDEX_FILES": "drive-files",
        "GEMINI_API_KEY": "your-gemini-api-key",
        "EMBEDDING_MODEL": "text-embedding-004"
      }
    }
  }
}
```

6. **Restart Claude Desktop**

### Using Semantic Search

Once indexed, Claude will automatically use semantic search tools:

- **`semantic_drive_query`**: Primary tool - searches folders, then files, then reads content
- **`semantic_search_folders`**: Find folders by natural language
- **`semantic_search_files`**: Find files within specific folders

**Example queries:**
- "find a file which contains DSA questions"
- "show me notes about machine learning"
- "where are my project documents"

### Re-indexing

Re-run indexing when:
- New files/folders are added
- File contents are significantly updated
- You want to refresh the semantic index

```bash
npm run index:drive
```

The system detects changes and only re-indexes modified items (incremental sync).

### How It Works

1. **Folder Indexing**: Each folder is summarized with:
   - Folder name and path
   - List of file names
   - Preview text from first few files

2. **File Indexing**: Each file is indexed with:
   - File name and type
   - Parent folder information
   - Preview text (first 5KB)

3. **Query Flow**:
   ```
   User Query
      ↓
   Embed query → Search folder index
      ↓
   Top 1-2 folders
      ↓
   Search file index within folders
      ↓
   Top 1-3 files
      ↓
   Read file contents
      ↓
   Return to Claude
   ```

### Backward Compatibility

All existing tools continue to work:
- `list-all-folders`
- `list-files-in-folder`
- `read-file-content`
- `get-file-download-link`

Semantic search tools are **additive** - they don't replace existing functionality.

## Troubleshooting

### Error 403: access_denied - "App has not completed the Google verification process"

If you encounter this error when trying to authenticate, it means your OAuth app is in "Testing" mode and your email address is not added as a test user. To fix this:

1. Go to the [Google Cloud Console OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Scroll down to the **Test users** section
3. Click **+ ADD USERS**
4. Add your Google account email address (the one you're using to authenticate)
5. Click **ADD**
6. Try running `npm run tokenGenerator` again

**Note:** For personal use, keeping the app in "Testing" mode and adding yourself as a test user is sufficient. If you want to make the app available to others without adding them as test users, you'll need to publish the app, which requires Google's verification process.

### Semantic Search Issues

**"Pinecone not initialized" or "Embeddings not initialized"**

- Check that `PINECONE_API_KEY` and `GEMINI_API_KEY` are set in your `.env` file
- Verify the keys are correct and have proper permissions
- Ensure indexes exist in Pinecone with correct dimensions

**"No matching folders found"**

- Run `npm run index:drive` to index your Drive
- Check that indexing completed successfully
- Verify your query is clear and specific

**Indexing is slow**

- This is normal for large Drives
- The system processes in batches to avoid rate limits
- Consider indexing specific folders first: `npm run index:folder <folderId>`
