"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const SIZE = 512;
/** Logo fills the central 64%, inside Android's maskable safe zone. */
const CONTENT = 0.64;

async function loadImage(src: string) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  return img;
}

/** Draw `src` centred on a square tile and return a PNG file. */
async function makeIcon(src: string, background: string): Promise<File> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const box = SIZE * CONTENT;
  const scale = Math.min(box / img.naturalWidth, box / img.naturalHeight);
  const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
  ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
  return new File([blob], "app-icon.png", { type: "image/png" });
}

/** App name + home-screen icon. The icon is generated in the browser from the
 *  logo (or a separate image) so it's square and padded for every phone. */
export function AppIconSection({ orgName, appName, iconUrl, logoUrl, primary }: {
  orgName: string; appName: string | null; iconUrl: string | null; logoUrl: string | null; primary: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const customInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(appName ?? "");
  const [source, setSource] = useState<string | null>(logoUrl);
  const [background, setBackground] = useState("#FFFFFF");
  const [preview, setPreview] = useState<string | null>(iconUrl);
  const [pending, setPending] = useState<"new" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const regenerate = useCallback(async (src: string | null, bg: string) => {
    setError(null);
    if (!src) return;
    try {
      const file = await makeIcon(src, bg);
      const dt = new DataTransfer();
      dt.items.add(file);
      if (fileInput.current) fileInput.current.files = dt.files;
      setPreview(URL.createObjectURL(file));
      setPending("new");
    } catch {
      setError("Couldn't make an icon from that image. Try a PNG or JPG.");
    }
  }, []);

  // First visit after uploading a logo: offer an icon made from it.
  useEffect(() => {
    if (!iconUrl && logoUrl) regenerate(logoUrl, background);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow logo changes made in the Branding section above.
  useEffect(() => {
    const onLogo = (e: Event) => {
      const url = (e as CustomEvent<string | null>).detail;
      setSource(url);
      if (url) regenerate(url, background);
    };
    window.addEventListener("logo-change", onLogo);
    return () => window.removeEventListener("logo-change", onLogo);
  }, [background, regenerate]);

  const label = name.trim() || orgName;
  const swatches = [
    { c: "#FFFFFF", n: "White" },
    { c: "#FAF5EE", n: "Sand" },
    { c: primary, n: "Primary colour" },
    { c: "#1C2B33", n: "Dark" },
  ];

  return (
    <section className="card space-y-5">
      <div>
        <h2 className="text-lg font-semibold">App on phones</h2>
        <p className="mt-1 text-sm text-muted">What your team sees when they add the portal to their home screen.</p>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        {/* Home-screen preview */}
        <div className="w-28 shrink-0 text-center">
          <div className="mx-auto h-[76px] w-[76px] overflow-hidden rounded-[18px] border border-line bg-surface shadow-sm">
            <img src={preview ?? "/icons/icon-192.png"} alt="App icon preview" className="h-full w-full object-cover" />
          </div>
          <p className="mt-1.5 truncate text-xs">{label.length > 12 ? label.slice(0, 11) + "…" : label}</p>
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <label htmlFor="app_name" className="label">App name</label>
            <input id="app_name" name="app_name" className="field" maxLength={30} value={name}
              placeholder={orgName} onChange={(e) => setName(e.target.value)} />
            <p className="mt-1 text-xs text-muted">Shown under the icon. 12 characters or fewer fits on most phones.</p>
          </div>

          <div>
            <span className="label">Icon background</span>
            <div className="flex flex-wrap items-center gap-2">
              {swatches.map((s) => (
                <button key={s.n} type="button" title={s.n} aria-label={s.n} aria-pressed={background === s.c}
                  disabled={!source}
                  onClick={() => { setBackground(s.c); regenerate(source, s.c); }}
                  className={`h-9 w-9 rounded-lg border-2 disabled:opacity-40 ${background === s.c ? "border-brand" : "border-line"}`}
                  style={{ background: s.c }} />
              ))}
              <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => customInput.current?.click()}>
                Use a different image…
              </button>
              {(iconUrl || pending === "new") && (
                <button type="button" className="btn-ghost px-3 py-1.5 text-sm text-danger" onClick={() => {
                  if (fileInput.current) fileInput.current.value = "";
                  setPreview(null);
                  setPending(iconUrl ? "reset" : null);
                }}>Use default icon</button>
              )}
            </div>
            {!source && !iconUrl && <p className="mt-1 text-xs text-muted">Upload a logo above (or choose an image) to make your own icon. Until then your team sees the Hoiva icon.</p>}
          </div>

          <input ref={fileInput} type="file" name="app_icon" accept="image/png" className="sr-only" tabIndex={-1} aria-hidden />
          <input ref={customInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 5 * 1024 * 1024) return setError("Choose an image under 5 MB.");
              const url = URL.createObjectURL(f);
              setSource(url);
              regenerate(url, background);
              e.target.value = "";
            }} />
          {pending === "reset" && <input type="hidden" name="remove_app_icon" value="on" />}

          {pending === "new" && <p className="text-sm text-muted">New icon ready — press <strong>Save settings</strong> to use it.</p>}
          {pending === "reset" && <p className="text-sm text-muted">The default Hoiva icon will be used after you press <strong>Save settings</strong>.</p>}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <p className="text-xs text-muted">Staff who already installed the app may need to remove it and add it again to see a new name or icon.</p>
        </div>
      </div>
    </section>
  );
}
