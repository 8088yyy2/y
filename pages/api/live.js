export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        error: "Missing 'id' parameter (YouTube handle)."
      });
    }

    const cleanId = id.replace(/^@/, '');
    const liveUrl = `https://www.youtube.com/@${cleanId}/live`;

    // Fetch function with headers safe for Vercel
    async function fetchHtml(url) {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Encoding': 'identity', // prevent Brotli issues on Vercel
          'Connection': 'keep-alive',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch ${url} — status: ${response.status}`);
      }

      return await response.text();
    }

    console.log(`Fetching: ${liveUrl}`);
    const liveHtml = await fetchHtml(liveUrl);

    // Look for a live stream watch URL
    const videoIdMatch = liveHtml.match(/\/watch\?v=([\w-]{11})/);

    if (!videoIdMatch || !videoIdMatch[1]) {
      return res.status(404).json({
        error: "No live video found — channel is likely offline."
      });
    }

    const videoId = videoIdMatch[1];
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`Detected live video: ${videoUrl}`);

    const videoHtml = await fetchHtml(videoUrl);

    // Extract the HLS manifest URL
    const hlsMatch = videoHtml.match(/"hlsManifestUrl":"([^"]+\.m3u8)"/);

    if (!hlsMatch || !hlsMatch[1]) {
      return res.status(404).json({
        error: "Live stream is not HLS-based or URL is missing."
      });
    }

    const streamUrl = hlsMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');

    console.log(`Redirecting to stream: ${streamUrl}`);
    return res.redirect(302, streamUrl);

  } catch (error) {
    console.error('Server error:', error.message);
    return res.status(500).json({
      error: "Server error while checking YouTube live status.",
      details: error.message
    });
  }
}
