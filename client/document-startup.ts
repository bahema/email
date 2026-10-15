// Initial HTML is an enhancement; an unavailable API must not block the page.
export function isPublicDocument(path: string, accept = '') {
  return accept.includes('text/html') && !/^\/(admin|api|media|go|email|downloads?)(\/|$)/.test(path) && !/\.[a-z0-9]+$/i.test(path);
}
export async function requestInitialDocument(path: string, host: string, fetcher: typeof fetch = fetch, timeoutMs = 1500, storageSaved = false) {
  try {
    const response = await fetcher('http://127.0.0.1:3001/api/public/initial-document?path=' + encodeURIComponent(path), {
      headers: { Host: host, ...(storageSaved?{Cookie:'affiliate_storage_notice=1'}:{}) }, signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200 && response.status !== 404) return null;
    return { status: response.status, html: await response.text() };
  } catch { return null; }
}
