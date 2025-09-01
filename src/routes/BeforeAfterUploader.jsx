import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const MEDIA_BUCKET = "media";

// --- helpers ---
function sanitizeName(name = "") {
  const dot = name.lastIndexOf(".");
  const base = (dot > -1 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const ext = dot > -1 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, "") : ".jpg";
  return `${base || "image"}${ext || ".jpg"}`;
}
function fileExt(mime = "image/jpeg") {
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  return ".jpg";
}
/** Downscale + recompress to JPEG/WebP, preserving aspect ratio. */
async function downscaleImage(
  file,
  { maxW = 2000, maxH = 2000, mime = "image/jpeg", quality = 0.9 } = {}
) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const w = img.naturalWidth, h = img.naturalHeight;
    const scale = Math.min(1, maxW / w, maxH / h);
    const W = Math.max(1, Math.round(w * scale));
    const H = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, W, H);

    const blob =
      (await new Promise((resolve) => canvas.toBlob(resolve, mime, quality))) ||
      (await (async () => {
        const dataURL = canvas.toDataURL(mime, quality);
        const res = await fetch(dataURL);
        return await res.blob();
      })());
    return { blob, width: W, height: H };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function BeforeAfterUploader({ communityId = null, onCreated }) {
  const [beforeFile, setBeforeFile] = useState(null);
  const [afterFile, setAfterFile] = useState(null);
  const [beforePreview, setBeforePreview] = useState(null);
  const [afterPreview, setAfterPreview] = useState(null);

  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState(null);
  const [uiState, setUiState] = useState("idle"); // "idle" | "uploading" | "done" | "error"

  const navigate = useNavigate();

  // Safe preview URLs
  useEffect(() => {
    if (!beforeFile) { setBeforePreview(null); return; }
    const url = URL.createObjectURL(beforeFile);
    setBeforePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [beforeFile]);

  useEffect(() => {
    if (!afterFile) { setAfterPreview(null); return; }
    const url = URL.createObjectURL(afterFile);
    setAfterPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [afterFile]);

  const handleSwap = () => {
    setBeforeFile((b) => {
      const tmp = afterFile;
      setAfterFile(b);
      return tmp;
    });
  };

  function surfaceError(msg) {
    setError(msg);
    setUiState("error");
    try { alert(msg); } catch {}
    console.error("[BA] ", msg);
  }

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setError("");
    setCreatedId(null);
    setProgress(0);
    setUiState("uploading");

    if (!beforeFile || !afterFile) {
      return surfaceError("Please select both Before and After images.");
    }

    try {
      setLoading(true);

      // 1) auth
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) throw new Error("You must be signed in.");

      // 2) downscale
      const preferredMime = "image/jpeg";
      const [{ blob: beforeBlob }, { blob: afterBlob }] = await Promise.all([
        downscaleImage(beforeFile, { mime: preferredMime }),
        downscaleImage(afterFile,  { mime: preferredMime }),
      ]);
      setProgress(35);

      // 3) upload to storage  (path starts with user.id to satisfy RLS)
      const ts = Date.now();
      const baseDir = `${user.id}/${ts}`;
      const beforeSafe = sanitizeName(beforeFile.name).replace(/\.[^.]+$/, fileExt(preferredMime));
      const afterSafe  = sanitizeName(afterFile.name).replace(/\.[^.]+$/, fileExt(preferredMime));
      const beforePath = `${baseDir}/before-${beforeSafe}`;
      const afterPath  = `${baseDir}/after-${afterSafe}`;

      const up1 = await supabase.storage.from(MEDIA_BUCKET).upload(beforePath, beforeBlob, {
        upsert: false, contentType: preferredMime
      });
      if (up1.error) throw up1.error;
      setProgress(65);

      const up2 = await supabase.storage.from(MEDIA_BUCKET).upload(afterPath, afterBlob, {
        upsert: false, contentType: preferredMime
      });
      if (up2.error) throw up2.error;
      setProgress(85);

      // 4) insert DB row (with user_id to satisfy RLS)
      const insertRow = {
        user_id: user.id,
        before_path: beforePath,
        after_path: afterPath,
        caption: caption?.trim() || null,
        is_public: true,            // you’re listing only public pairs on Community
      };
      if (communityId) insertRow.community_id = communityId;

      const { data, error: insErr } = await supabase
        .from("before_after_pairs")
        .insert(insertRow)
        .select("id")
        .single();

      if (insErr) throw insErr;

      setProgress(100);
      setUiState("done");
      setBeforeFile(null);
      setAfterFile(null);
      setCaption("");
      setCreatedId(data?.id ?? null);

      // let Community refresh if parent provided a callback
      onCreated?.(data);

      // 5) 🚀 go straight to the details page so you don’t hit a 404
      // tiny timeout helps avoid any UI race
      setTimeout(() => navigate(`/p/${data.id}`), 120);
    } catch (err) {
      console.error("[BA] ERROR", err);
      surfaceError(err?.message || "Upload failed");
    } finally {
      setLoading(false);
      // clear file inputs
      document.querySelectorAll(".ba-uploader input[type=file]").forEach((inp) => (inp.value = ""));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="ba-uploader">
      <small style={{ color: "#6b7280" }}>status: {uiState}</small>

      {error && (
        <div className="error-banner" role="alert">{error}</div>
      )}

      <div className="row">
        <label className="file">
          <span>Before image</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => { setBeforeFile(e.target.files?.[0] || null); setError(""); }}
          />
        </label>
        <label className="file">
          <span>After image</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => { setAfterFile(e.target.files?.[0] || null); setError(""); }}
          />
        </label>
      </div>

      <div className="caption">
        <input
          type="text"
          placeholder="Add an optional caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={160}
        />
      </div>

      {(beforePreview || afterPreview) && (
        <div className="preview">
          <div className="side">
            {beforePreview && (
              <img alt="Before preview" src={beforePreview} onError={(e) => { e.currentTarget.src = ""; }} />
            )}
            <div className="tag">Before</div>
          </div>
          <div className="side">
            {afterPreview && (
              <img alt="After preview" src={afterPreview} onError={(e) => { e.currentTarget.src = ""; }} />
            )}
            <div className="tag">After</div>
          </div>
        </div>
      )}

      <div className="actions">
        <button
          type="button"
          className="button ghost"
          onClick={handleSwap}
          disabled={!beforeFile || !afterFile}
        >
          Swap
        </button>
        <button
          type="button"
          className="button"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? (progress >= 100 ? "Finishing…" : `Uploading… ${progress}%`) : "Post Before + After"}
        </button>
      </div>

      {createdId && (
        <p className="success">
          Posted!{" "}
          <button
            type="button"
            className="button ghost"
            onClick={() => navigate(`/p/${createdId}`)}
          >
            View details
          </button>
        </p>
      )}

      <small className="hint">Tip: large images are auto-compressed to ~2000px max for faster uploads.</small>

      <style>{`
        .ba-uploader { display: grid; gap: 12px; }
        .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .file { display: grid; gap: 6px; }
        .caption input { width: 100%; padding: 10px; border-radius: 10px; border: 1px solid #ccc; }
        .preview { display: grid; gap: 8px; grid-template-columns: repeat(2, 1fr); align-items: start; }
        .side { position: relative; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; background: #fafafa; min-height: 120px; }
        .side img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .tag { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,.65); color: #fff; font-size: 12px; padding: 4px 8px; border-radius: 999px; }
        .actions { display: flex; gap: 8px; }
        .error-banner { background: #FEF2F2; border: 1px solid #FCA5A5; color: #991B1B; padding: 8px 10px; border-radius: 10px; }
        .success { color: #065f46; display: flex; align-items: center; gap: 8px; }
        .hint { color: #6b7280; }
        button { padding: 10px 14px; border-radius: 10px; border: none; background: #111827; color: #fff; cursor: pointer; }
        .button.ghost, .button.ghost:where(button) { background: transparent; border: 1px solid #d1d5db; color: #111827; }
        @media (max-width: 720px) {
          .row { grid-template-columns: 1fr; }
          .preview { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
    </form>
  );
}
