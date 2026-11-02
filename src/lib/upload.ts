/** Reads an uploaded file from FormData.
 *  Uses duck typing rather than `instanceof File`: on Cloudflare Workers the
 *  File object can come from a different runtime realm, so `instanceof`
 *  silently fails and the upload is skipped. */
export async function readUpload(value: FormDataEntryValue | null): Promise<{ bytes: ArrayBuffer; type: string; size: number } | null> {
  if (!value || typeof value === "string") return null;
  const f = value as Blob & { size?: number; type?: string };
  if (typeof f.arrayBuffer !== "function" || !f.size) return null;
  return { bytes: await f.arrayBuffer(), type: f.type || "application/octet-stream", size: f.size };
}
