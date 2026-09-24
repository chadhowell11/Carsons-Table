// @ts-check
// THE ONLY file that talks to storage (spec §9). Uses lib/db.js clients.
// Variants mirror the prototype's scripts/add-photo.py: thumb 220×220 cover q76,
// card 720w q78, hero 1600w q78; the original is re-encoded to WebP q78.
//
// Callers authorize first (requireStaff, or a platform script); putMedia and
// deleteMedia then write with the service client.
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { HttpError, fromStoreError } from './errors.js';
import { MEDIA_KINDS } from './enums.js';

export const BUCKET = 'media';
export const VARIANTS = Object.freeze({
  thumb: { width: 220, height: 220, fit: /** @type {const} */ ('cover'), quality: 76 },
  card: { width: 720, quality: 78 },
  hero: { width: 1600, quality: 78 },
});
const ORIGINAL = { maxWidth: 2400, quality: 78 };
export const ACCEPTED_MIME = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/avif']);

/** @param {string} tenantId @param {string} mediaId @param {string} [variant] */
export const objectPath = (tenantId, mediaId, variant) => `${tenantId}/${mediaId}${variant ? `-${variant}` : ''}.webp`;

/**
 * Encode the original and every variant. Pure (no I/O besides sharp).
 * @param {Buffer} buffer
 */
export async function encodeImage(buffer) {
  let meta;
  try { meta = await sharp(buffer).rotate().metadata(); } catch { throw new HttpError(400, 'VALIDATION', { message: "That file isn't an image we can read.", fields: { file: 'not an image' } }); }
  const base = () => sharp(buffer).rotate();
  const original = await base().resize({ width: ORIGINAL.maxWidth, withoutEnlargement: true }).webp({ quality: ORIGINAL.quality }).toBuffer({ resolveWithObject: true });
  /** @type {Record<string, Buffer>} */
  const variants = {};
  for (const [name, v] of Object.entries(VARIANTS)) {
    const r = 'height' in v
      ? base().resize({ width: v.width, height: v.height, fit: v.fit })
      : base().resize({ width: v.width, withoutEnlargement: true });
    variants[name] = await r.webp({ quality: v.quality }).toBuffer();
  }
  return { original: original.data, width: original.info.width, height: original.info.height, variants, sourceFormat: meta.format };
}

/**
 * Upload an image and its variants, then insert the media row.
 * Storage failure -> 503 STORAGE_UNAVAILABLE; row failure -> objects removed, 503 STORE_UNAVAILABLE.
 * @param {{ tenant: any, buffer: Buffer, mime: string, kind?: string, alt?: string, focal?: {x:number,y:number} }} p
 */
export async function putMedia({ tenant, buffer, mime, kind = 'dish', alt = '', focal }) {
  if (!ACCEPTED_MIME.includes(mime)) throw new HttpError(400, 'VALIDATION', { message: `Photos must be one of: ${ACCEPTED_MIME.join(', ')}.`, fields: { file: mime } });
  if (!(/** @type {readonly string[]} */ (MEDIA_KINDS)).includes(kind)) throw new HttpError(400, 'VALIDATION', { message: `kind must be one of: ${MEDIA_KINDS.join(', ')}.`, fields: { kind } });
  const img = await encodeImage(buffer);
  const id = randomUUID();
  const svc = tenant.adminClient; // authorize-then-write: caller verified staff membership or is a platform script
  const bucket = svc.storage.from(BUCKET);
  const uploads = [[objectPath(tenant.id, id), img.original], ...Object.entries(img.variants).map(([v, b]) => [objectPath(tenant.id, id, v), b])];
  const done = [];
  for (const [path, body] of uploads) {
    let res;
    try { res = await bucket.upload(path, body, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' }); } catch (e) { res = { error: e }; }
    if (res.error) {
      if (done.length) await bucket.remove(done).catch(() => {});
      console.error('storage upload failed:', res.error.message || res.error);
      throw new HttpError(503, 'STORAGE_UNAVAILABLE');
    }
    done.push(path);
  }
  const row = {
    id, tenant_id: tenant.id, storage_path: objectPath(tenant.id, id), kind, alt,
    variants: Object.fromEntries(Object.keys(img.variants).map((v) => [v, objectPath(tenant.id, id, v)])),
    width: img.width, height: img.height,
    focal_x: focal ? clamp01(focal.x) : 0.5, focal_y: focal ? clamp01(focal.y) : 0.5,
  };
  const ins = await svc.from('media').insert(row).select().single();
  if (ins.error) {
    await bucket.remove(done).catch(() => {});
    throw fromStoreError(ins.error, 'write');
  }
  return ins.data;
}

/** @param {number} n */
const clamp01 = (n) => Math.min(1, Math.max(0, Number(n) || 0));

/** Remove a media row's objects and the row. @param {{ tenant: any, media: any }} p */
export async function deleteMedia({ tenant, media }) {
  if (media.tenant_id !== tenant.id) throw new HttpError(404, 'NOT_FOUND');
  const svc = tenant.adminClient; // authorize-then-write: caller verified manager/owner role
  const paths = [media.storage_path, ...Object.values(media.variants || {})];
  const rm = await svc.storage.from(BUCKET).remove(paths);
  if (rm.error) throw new HttpError(503, 'STORAGE_UNAVAILABLE', 'The photo was not deleted. Try again in a moment.');
  const del = await svc.from('media').delete().eq('id', media.id).eq('tenant_id', tenant.id);
  if (del.error) throw fromStoreError(del.error, 'write');
}

/** Public URL for a media row's variant (or the original). @param {any} tenant @param {any} media @param {keyof typeof VARIANTS} [variant] */
export function mediaUrl(tenant, media, variant) {
  const path = variant ? media.variants && media.variants[variant] : media.storage_path;
  if (!path) return null;
  return `${tenant.publicConfig().url}/storage/v1/object/public/${BUCKET}/${path}`;
}
