import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing 'id' parameter." });
  const cleanId = id.replace(/^@/, '');
  const liveUrl = `https://www.youtube.com/@${cleanId}/live`;

  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.goto(liveUrl, { waitUntil: 'networkidle2' });

    const ytUrl = await page.evaluate(() => {
      const link = document.querySelector('a.yt-simple-endpoint.style-scope.yt-live-chat-renderer');
      if (link?.href) return link.href;
      const canonical = document.querySelector('link[rel="canonical"]');
      if (canonical?.href) return canonical.href;
      return null;
    });

    if (!ytUrl?.includes('youtube.com/watch?v=')) {
      return res.status(404).json({
        status: 'offline',
        message: 'No live video found (channel likely offline or blocked).'
      });
    }

    await page.goto(ytUrl, { waitUntil: 'networkidle2' });
    const hlsUrl = await page.evaluate(() => {
      const text = document.documentElement.innerHTML;
      const m = /"hlsManifestUrl":"([^"]+\.m3u8)"/.exec(text);
      return m ? m[1].replace(/\\u0026/g, '&').replace(/\\/g, '') : null;
    });

    if (!hlsUrl) {
      return res.status(404).json({
        status: 'error',
        message: 'HLS manifest not found'
      });
    }

    return res.redirect(302, hlsUrl);

  } catch (e) {
    console.error('Error fetching live:', e);
    return res.status(500).json({ error: 'Internal error', details: e.message });
  } finally {
    if (browser) await browser.close();
  }
}
