import { GoogleGenerativeAI } from '@google/generative-ai'

let genAI: GoogleGenerativeAI | null = null
let model: string = 'text-embedding-004'

/**
 * Initialize Google Gemini client for embeddings
 */
export function initEmbeddings(apiKey: string, embeddingModel?: string): void {
  if (genAI) {
    console.log('Embeddings already initialized')
    return
  }

  genAI = new GoogleGenerativeAI(apiKey)
  if (embeddingModel) {
    model = embeddingModel
  }
  
  console.log(`Gemini embeddings initialized with model: ${model}`)
}

/**
 * Get Gemini client instance
 */
function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    throw new Error('Embeddings not initialized. Call initEmbeddings first.')
  }
  return genAI
}

/**
 * Generate embedding for a single text
 */
export async function embedText(text: string): Promise<number[]> {
  try {
    const client = getClient()
    const embeddingModel = client.getGenerativeModel({ model })
    
    // Gemini API: embedContent takes content as string
    // For embedding models, we use embedContent method
    const result = await embeddingModel.embedContent(text)
    
    // Extract embedding values from result
    // Gemini API returns: { embedding: { values: number[] } }
    let embedding: number[] | undefined
    
    // Try different possible response structures
    if (result.embedding?.values && Array.isArray(result.embedding.values)) {
      embedding = result.embedding.values
    } else if (result.embedding && Array.isArray(result.embedding)) {
      embedding = result.embedding
    } else if ((result as any).embedding) {
      // Fallback: try direct access
      const emb = (result as any).embedding
      if (Array.isArray(emb)) {
        embedding = emb
      } else if (emb.values && Array.isArray(emb.values)) {
        embedding = emb.values
      }
    }
    
    if (!embedding || embedding.length === 0) {
      console.error('Gemini API response structure:', JSON.stringify(result, null, 2))
      throw new Error('No embedding returned from Gemini API. Check API response structure above.')
    }
    
    return embedding
  } catch (error) {
    console.error('Error generating embedding:', error)
    throw error
  }
}

/**
 * Generate embeddings for multiple texts (batch)
 * Handles rate limiting with retries
 * Note: Gemini API processes one text at a time, so we batch sequentially
 */
export async function embedTexts(
  texts: string[],
  batchSize: number = 20, // Smaller batch size for Gemini
  maxRetries: number = 3
): Promise<number[][]> {
  const embeddings: number[][] = []
  
  // Process in batches to avoid rate limits
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    
    // Process batch items sequentially (Gemini processes one at a time)
    for (const text of batch) {
      let retries = 0
      let success = false
      
      while (retries < maxRetries && !success) {
        try {
          const embedding = await embedText(text)
          embeddings.push(embedding)
          success = true
          
          // Small delay between requests
          await new Promise((resolve) => setTimeout(resolve, 50))
        } catch (error: any) {
          retries++
          if (retries >= maxRetries) {
            console.error(`Failed to embed text after ${maxRetries} retries:`, error)
            throw error
          }
          
          // Exponential backoff
          const waitTime = Math.pow(2, retries) * 1000
          console.log(`Rate limit hit, retrying in ${waitTime}ms...`)
          await new Promise((resolve) => setTimeout(resolve, waitTime))
        }
      }
    }
    
    // Rate limiting: wait a bit between batches
    if (i + batchSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  
  return embeddings
}

/**
 * Check if embeddings are initialized
 */
export function isInitialized(): boolean {
  return genAI !== null
}

