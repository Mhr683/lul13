// Small WebP copies of product pictures (made by the server's /img route, see server.ts). Phones get
// a picture the size it is shown at instead of the full original: most originals are 0.2-1.4 MB,
// a product card needs 20-30 KB. Pictures that cannot be copied (data: links, SVG, GIF, http://)
// keep their own address; if a copy fails to load, ProductImage falls back to the original.

const OWN = /^https?:\/\/(?:[\w-]+\.)?anokhashopinghub\.shop(\/media\/[\w.-]+)$/i;

const b64url = (s: string) =>
  btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** The picture's address normalised for the server, or '' when it cannot be copied */
function source(src: string): string {
  const s = String(src || '').trim();
  const own = OWN.exec(s);
  if (own) return own[1];
  if (/^\/media\/[\w.-]+\.(jpe?g|png|webp)$/i.test(s)) return s;
  if (/^https:\/\//i.test(s) && !/\.(svg|gif)(\?|#|$)/i.test(s) && s.length < 2000) return s;
  return '';
}

/** A copy `width` pixels wide (one of 160, 320, 480, 640, 800, 1200), or the original */
export function smallImage(src: string, width: number): string {
  const s = source(src);
  return s ? `/img/w${width}/${b64url(s)}.webp` : src;
}

/** srcSet for the given widths, or undefined when the picture cannot be copied */
export function smallImageSet(src: string, widths: number[]): string | undefined {
  const s = source(src);
  if (!s) return undefined;
  const id = b64url(s);
  return widths.map((w) => `/img/w${w}/${id}.webp ${w}w`).join(', ');
}
