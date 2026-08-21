const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  json: 'application/json',
  css: 'text/css',
  js: 'text/javascript',
  txt: 'text/plain',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

const DEFAULT_MEDIA_TYPE = 'application/octet-stream';

/** Best-effort content type from a file extension. Assets are arbitrary
 * binary files, so byte-sniffing is not worth the dependency it would take. */
export function mediaTypeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  return (ext && MEDIA_TYPES[ext]) || DEFAULT_MEDIA_TYPE;
}
