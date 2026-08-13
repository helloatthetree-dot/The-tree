import { useRef, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { Loader2, ImagePlus, X } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export function resolveImg(url) {
  if (!url) return null;
  return url.startsWith("http") ? url : `${BACKEND}${url}`;
}

export function ImageUpload({ value, onChange, kind = "misc", label = "Photo", testid }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);

  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/admin/upload", fd, { params: { kind } });
      onChange(data.url);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Upload failed");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  const src = resolveImg(value);
  return (
    <div>
      <label className="text-xs uppercase tracking-[0.15em] text-komorebi-muted">
        {label} <span className="normal-case tracking-normal text-komorebi-muted/70">(optional)</span>
      </label>
      <div className="mt-1.5 flex items-center gap-3">
        {src && (
          <div className="relative">
            <img src={src} alt="" className="h-16 w-16 rounded-xl object-cover hairline" />
            <button type="button" onClick={() => onChange("")} className="absolute -top-2 -right-2 h-6 w-6 grid place-items-center rounded-full bg-white hairline text-komorebi-danger">
              <X size={13} />
            </button>
          </div>
        )}
        <label data-testid={testid} className="cursor-pointer rounded-xl hairline bg-komorebi-bg px-4 py-3 text-sm flex items-center gap-2 hover:bg-komorebi-bg2">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
          {src ? "Replace" : "Upload image"}
          <input ref={ref} type="file" accept="image/*" className="hidden" onChange={upload} disabled={busy} />
        </label>
      </div>
    </div>
  );
}
