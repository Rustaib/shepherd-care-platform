"use client";
import { useRef, useState } from "react";

const TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX = 2 * 1024 * 1024;

/** Click-or-drop logo upload. The preview box is the upload target. */
export function LogoPicker({ current }: { current: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(current);
  const [fileName, setFileName] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const accept = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!TYPES.includes(file.type)) return reject("Use a PNG, JPG or WebP image.");
    if (file.size > MAX) return reject(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 2 MB.`);
    // Put a dropped file into the real input so it's submitted with the form
    if (input.current && input.current.files?.[0] !== file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.current.files = dt.files;
    }
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
    setRemoved(false);
  };
  const reject = (msg: string) => {
    setError(msg);
    if (input.current) input.current.value = "";
  };
  const remove = () => {
    if (input.current) input.current.value = "";
    setPreview(null);
    setFileName(null);
    setRemoved(!!current);
    setError(null);
  };

  return (
    <div className="space-y-2">
      <span className="label">Logo</span>
      <div className="flex flex-wrap items-center gap-4">
        <label
          htmlFor="logo"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); accept(e.dataTransfer.files?.[0]); }}
          className={`group relative flex h-28 w-60 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed p-3 text-center transition
            ${dragging ? "border-brand bg-brand/10" : "border-line bg-surface hover:border-brand hover:bg-brand/5"}`}
        >
          {preview ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Logo preview" className="max-h-full max-w-full object-contain" />
              <span className="absolute inset-0 grid place-items-center bg-black/55 text-sm font-semibold text-white opacity-0 transition group-hover:opacity-100">
                Change logo
              </span>
            </>
          ) : (
            <span className="space-y-1 text-sm">
              <svg viewBox="0 0 24 24" className="mx-auto h-7 w-7 text-muted" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              <span className="block font-semibold text-ink">Upload logo</span>
              <span className="block text-xs text-muted">Click, or drag an image here</span>
            </span>
          )}
        </label>
        <input ref={input} id="logo" type="file" name="logo" accept={TYPES.join(",")} className="sr-only"
          onChange={(e) => accept(e.target.files?.[0])} />
        {removed && <input type="hidden" name="remove_logo" value="on" />}

        <div className="space-y-2 text-sm">
          {preview && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => input.current?.click()}>Change</button>
              <button type="button" className="btn-ghost px-3 py-1.5 text-danger" onClick={remove}>Remove</button>
            </div>
          )}
          {fileName && <p className="text-muted">Selected: <span className="text-ink">{fileName}</span> — press <strong>Save settings</strong> to apply.</p>}
          {removed && <p className="text-muted">Logo will be removed when you press <strong>Save settings</strong>.</p>}
          <p className="text-xs text-muted">PNG, JPG or WebP, up to 2 MB. A wide logo on a transparent background works best.</p>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
