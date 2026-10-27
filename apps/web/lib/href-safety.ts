/**
 * Href safety helpers shared by server pages and the client banner carousel.
 * Deliberately dependency-free so it can be imported from 'use client' files.
 */

/** Internal same-site link: starts with a single slash (never `//host` or `\\host`). */
export function isSafeInternalHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !href.startsWith('\\');
}

/** External link we are willing to open in a new tab: http(s) only. */
export function isSafeExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}
