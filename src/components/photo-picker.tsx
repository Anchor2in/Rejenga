import { ImagePlus, X } from "lucide-react";
import { useEffect, useState } from "react";

export function PhotoPicker({ files, onChange, max }: { files: File[]; onChange: (f: File[]) => void; max: number }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [files]);
  return (
    <div className="flex flex-wrap gap-3">
      {urls.map((u, i) => (
        <div key={u} className="relative size-24 overflow-hidden rounded-lg border">
          <img src={u} alt={`Selected photo ${i + 1}`} className="size-full object-cover" />
          <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white" aria-label={`Remove photo ${i + 1}`}>
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {files.length < max && (
        <label className="grid size-24 cursor-pointer place-items-center rounded-lg border border-dashed bg-card text-center text-xs text-muted-foreground hover:border-copper">
          <span className="grid justify-items-center gap-1"><ImagePlus className="size-5" aria-hidden="true" /> Add photo</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={(e) => {
              onChange([...files, ...Array.from(e.target.files ?? [])].slice(0, max));
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
