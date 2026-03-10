// Re-export the CLM handlers at the /chat/completions subpath
// Hume appends /chat/completions to the configured CLM URL for SSE mode
export { GET, POST } from '../../route'
