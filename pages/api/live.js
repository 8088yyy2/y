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
  console.log('Live page URL:', liveUrl);

  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });
    const page = await browser.newPage();

    console.log('Navigating to live URL...');
    await page.goto(liveUrl, { waitUntil: 'networkidle2' });

    const canonical = await page.$eval('link[rel="canonical"]', el => el.href).catch(() => null);
    console.log('Canonical URL found:', canonical);

    if (!canonical || !canonical.includes('/watch?v=')) {
      return res.status(200).json({ status: 'offline', canonical });
    }

    console.log('Going to video page:', canonical);
    await page.goto(canonical, { waitUntil: 'networkidle2' });

    const rawHtml = await page.content();
    console.log('Fetched video page HTML length:', rawHtml.length);

    const hlsMatch = rawHtml.match(/"hlsManifestUrl":"([^"]+\.m3u8)"/);
    console.log('HLS match object:', hlsMatch);

    if (!hlsMatch || !hlsMatch[1]) {
      return res.status(200).json({ status: 'error', message: 'No HLS URL', hlsMatch: !!hlsMatch });
    }

    const hlsUrl = hlsMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
    console.log('Extracted HLS URL:', hlsUrl);

    return res.redirect(302, hlsUrl);

  } catch (e) {
    console.error('Error in handler:', e);
    return res.status(500).json({ error: 'Internal error', details: e.message });
  } finally {
    if (browser) await browser.close();
  }
}
