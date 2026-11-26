// One way to draw a staff member everywhere: their photo if they have one,
// otherwise coloured initials. Colour is picked from the id so the same
// person always gets the same colour.
import { assetUrl } from "../../lib/format";

const TONES = [
  "bg-avatar-1 text-avatar-1-ink",
  "bg-avatar-2 text-avatar-2-ink",
  "bg-avatar-3 text-avatar-3-ink",
  "bg-avatar-4 text-avatar-4-ink",
  "bg-avatar-5 text-avatar-5-ink",
];

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export function StaffAvatar({
  id,
  name,
  avatarUrl,
  className = "h-9 w-9 text-sm",
}: {
  id: number;
  name: string;
  avatarUrl?: string | null;
  /** Size + font size, e.g. "h-14 w-14 text-lg". */
  className?: string;
}) {
  const src = assetUrl(avatarUrl);
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${src ? "bg-surface-sunken" : TONES[id % TONES.length]} ${className}`}>
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}
