export async function GET() {
  return new Response(JSON.stringify({ message: 'Hello from Next.js backend' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // allow your Vite dev server to call this during development
      'Access-Control-Allow-Origin': '*'
    }
  })
}
