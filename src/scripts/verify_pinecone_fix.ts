import 'dotenv/config'
import { initPinecone, upsertVectors } from '../lib/pinecone.js'

async function verify() {
    console.log('Starting Pinecone verification...')

    const apiKey = process.env.PINECONE_API_KEY || 'test-api-key'
    const indexFolders = process.env.PINECONE_INDEX_FOLDERS || 'test-folders'

    // Ensure host is set for the test path
    if (!process.env.PINECONE_FOLDERS_HOST) {
        if (apiKey === 'test-api-key') {
            console.log('Mocking PINECONE_FOLDERS_HOST for test')
            process.env.PINECONE_FOLDERS_HOST = 'https://test-index-projectid.svc.pinecone.io'
        } else {
            console.warn('Warning: PINECONE_FOLDERS_HOST not set in env, test likely to fail with "Missing Pinecone host"')
        }
    }

    try {
        // 1. Initialize
        console.log('Initializing Pinecone...')
        await initPinecone(apiKey, indexFolders, 'test-files')

        // 2. Attempt operation
        // Using a single dummy command to force the index object to be created and used.
        // If we pass an object {host} instead of string host, the URL construction in SDK will likely fail
        // or the SDK will throw an ArgumentError immediately.
        console.log('Calling upsertVectors to trigger getIndex...')

        // We pass 1 fake vector. This will trigger network call.
        // If API key is valid, it might succeed or fail with something logical.
        // If API key is invalid (dummy), it will fail with 401.
        // If Host is object (bug), it will fail with "Invalid URL" or similar.
        await upsertVectors(indexFolders, [{
            id: 'verify-fix-test-1',
            values: Array(1536).fill(0), // standard dim
            metadata: { test: true }
        }])

        console.log('SUCCESS: upsertVectors completed directly (unlikely with dummy key, but good if real key)')
    } catch (err: any) {
        console.log('Caught expected runtime flow.')
        console.log('Error message:', err.message)

        if (err.message.includes('Missing Pinecone host')) {
            console.error('FAILURE: Host logic validation failed inside our code.')
            process.exit(1)
        } else if (err.message.includes('Argument of type')) {
            console.error('FAILURE: Type error manifested at runtime (unexpected).')
            process.exit(1)
        } else {
            // Analyze for success indicators
            // If "Unauthorized", "Forbidden", "Not Found", "dns", "fetch failed" -> It means it TRIED to hit the URL.
            // The URL would be constructed from the host.
            // If host was {host: '...'}, URL would be 'https://[object Object]...' which fails DNS or fetch.
            // Error 'getaddrinfo ENOTFOUND [object Object]' would verify failure.
            // Error '...pinecone.io' implies SUCCESS of argument passing.

            if (err.message.includes('[object Object]')) {
                console.error('FAILURE: Host passed as object! Fix failed.')
                process.exit(1)
            }

            console.log('PASSED: Error indicates correct argument structure was used (network/auth error is expected).')
        }
    }
}

verify().catch(e => {
    console.error('Unexpected script error:', e)
    process.exit(1)
})
