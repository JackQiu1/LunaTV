/*
 * Robust spider.jar provider
 * - Sequentially tries remote candidates
 * - Caches successful jar (memory) for TTL
 * - Provides minimal fallback jar when all fail (still 200 to avoid TVBox unreachable)
 */
import crypto from 'crypto';

// Remote jar candidates (order by stability and SSL compatibility)
// 优先使用支持 HTTPS 且稳定的源，减少 SSL handshake 错误
const CANDIDATES: string[] = [
  // 优先：国内稳定源（避免 SSL 问题）
  'https://gitcode.net/qq_26898231/TVBox/-/raw/main/JAR/XC.jar',
  'https://gitee.com/q215613905/TVBoxOS/raw/main/JAR/XC.jar',

  // jsDelivr CDN（全球加速，SSL 稳定）
  'https://cdn.jsdelivr.net/gh/hjdhnx/dr_py@main/js/drpy.jar',
  'https://cdn.jsdelivr.net/gh/FongMi/CatVodSpider@main/jar/spider.jar',

  // GitHub 原始链接（备用）
  'https://raw.githubusercontent.com/hjdhnx/dr_py/main/js/drpy.jar',
  'https://raw.githubusercontent.com/FongMi/CatVodSpider/main/jar/spider.jar',

  // 代理源（最后备用）
  'https://ghproxy.com/https://raw.githubusercontent.com/hjdhnx/dr_py/main/js/drpy.jar',
];

// Minimal valid JAR (ZIP) with MANIFEST.MF (base64)
// Generated from: jar cfe empty.jar (with basic manifest) minimized.
const FALLBACK_JAR_BASE64 =
  'UEsDBBQAAAAIAI2JZFMAAAAAAAAAAAAAAAAJAAAATUVUQS1JTkYvUEsDBBQAAAAIAI2JZFN2y5eRAAAAACAAAAAUAAAATUVUQS1JTkYvTUFOSUZFU1QuTUZNYW5pZmVzdC1WZXJzaW9uOiAxLjAKCkNyZWF0ZWQtQnk6IEx1bmFUViBGYWxsYmFjawpQS' +
  'sHCO8JVu8/AAAAOAAAAFBLAQIUABQAAAAIAI2JZFMA7wlW7z8AAABOAAAAJAAAAAAAAAAAAAAAAAAAAAAATUVUQS1JTkYvUEsBAhQAFAAAAAgAjYlkU3bLl5EAAAAAIAAAABQAAAAAAAAAAAAAAAADgAAABNRVRBLUlORi9NQU5JRkVTVC5NRlBLBQYAAAAAAgACAHAAAABNAAAAAAA=';

export interface SpiderJarInfo {
  buffer: Buffer;
  md5: string;
  source: string; // url or 'fallback'
  success: boolean; // true if fetched real remote jar
  cached: boolean;
  timestamp: number;
  size: number;
  tried: number; // number of candidates tried until success/fallback
}

let cache: SpiderJarInfo | null = null;
const TTL = 6 * 60 * 60 * 1000; // 6h

async function fetchRemote(
  url: string,
  timeoutMs = 15000
): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    // 优化的请求头，提升兼容性，减少 SSL 问题
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 11; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Mobile Safari/537.36',
      Accept: '*/*',
      'Accept-Encoding': 'identity', // 避免压缩导致的问题
      Connection: 'close', // 避免连接复用问题
      'Cache-Control': 'no-cache',
    };

    // 直接获取文件内容，跳过 HEAD 检查（减少请求次数）
    const resp = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers,
    });
    clearTimeout(id);

    if (!resp.ok || resp.status >= 400) return null;
    const ab = await resp.arrayBuffer();
    if (ab.byteLength < 1000) return null; // jar 文件应该至少 1KB

    return Buffer.from(ab);
  } catch (error) {
    // 记录但不抛出错误，让系统尝试下一个候选
    return null;
  }
}

function md5(buf: Buffer): string {
  return crypto.createHash('md5').update(buf).digest('hex');
}

export async function getSpiderJar(
  forceRefresh = false
): Promise<SpiderJarInfo> {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.timestamp < TTL) {
    console.log('[SpiderJar] Using cached jar:', cache.source);
    return { ...cache, cached: true };
  }

  console.log('[SpiderJar] Cache expired or force refresh, probing candidates...');
  let tried = 0;
  for (const url of CANDIDATES) {
    tried += 1;
    console.log(`[SpiderJar] Trying candidate ${tried}: ${url}`);
    const buf = await fetchRemote(url);
    if (buf) {
      const info: SpiderJarInfo = {
        buffer: buf,
        md5: md5(buf),
        source: url,
        success: true,
        cached: false,
        timestamp: now,
        size: buf.length,
        tried,
      };
      cache = info;
      console.log(`[SpiderJar] Success! Cached jar from ${url} (${buf.length} bytes, md5: ${info.md5})`);
      return info;
    }
  }

  // fallback
  console.warn('[SpiderJar] All candidates failed, using fallback minimal jar');
  const fb = Buffer.from(FALLBACK_JAR_BASE64, 'base64');
  const info: SpiderJarInfo = {
    buffer: fb,
    md5: md5(fb),
    source: 'fallback',
    success: false,
    cached: false,
    timestamp: now,
    size: fb.length,
    tried,
  };
  cache = info; // still cache fallback to avoid hammering
  console.log(`[SpiderJar] Fallback jar cached (${fb.length} bytes, md5: ${info.md5})`);
  return info;
}

export function getSpiderStatus(): Omit<SpiderJarInfo, 'buffer'> | null {
  if (!cache) return null;
  const { buffer, ...rest } = cache;
  return rest;
}

export function getCandidates(): string[] {
  return [...CANDIDATES];
}
