import { IconClock, IconFlame, IconCheckCircle, IconXCircle } from "../icons";

type Tone = "info" | "warning" | "success" | "danger" | "neutral";

type IconComponent = React.ComponentType<{ className?: string }>;

const TONE_STYLES: Record<Tone, string> = {
  info: "bg-status-info-tint text-status-info-ink",
  warning: "bg-status-warning-tint text-status-warning-ink",
  success: "bg-status-success-tint text-status-success-ink",
  danger: "bg-status-danger-tint text-status-danger-ink",
  neutral: "bg-surface-sunken text-ink-secondary",
};

const TONE_ICON: Record<Tone, IconComponent | null> = {
  info: IconClock,
  warning: IconFlame,
  success: IconCheckCircle,
  danger: IconXCircle,
  neutral: null,
};

type StatusBadgeProps = {
  tone: Tone;
  children: React.ReactNode;
  icon?: IconComponent;
};

export function StatusBadge({ tone, children, icon }: StatusBadgeProps) {
  const Icon = icon ?? TONE_ICON[tone];
  return (
    <span className={`label-sm inline-flex items-center gap-1.5 rounded-pill px-3 py-1 ${TONE_STYLES[tone]}`}>
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}
