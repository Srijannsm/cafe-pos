import { apiFetchJson } from "./api";
import { prepareImage, type CropArea } from "./image";

/** Crop + compress in the browser, then upload. Returns the stored path. */
export async function uploadImage(
  file: File,
  kind: "menu" | "cover" | "category" | "staff",
  aspect: number,
  maxWidth: number,
  crop?: CropArea | null,
) {
  if (file.size > 15 * 1024 * 1024) throw new Error("That image is too large (max 15 MB)");
  const blob = await prepareImage(file, { aspect, maxWidth, crop });
  const form = new FormData();
  form.append("file", blob, blob.type === "image/webp" ? "image.webp" : "image.jpg");
  const res = await apiFetchJson<{ url: string }>(`/uploads/image/${kind}`, { method: "POST", body: form });
  return res.url;
}
