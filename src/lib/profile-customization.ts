export type ActivityStatus = "active" | "away" | "offline" | "dnd";

export const ACTIVITY_STATUS_OPTIONS: Array<{
  value: ActivityStatus;
  label: string;
  description: string;
  dotClass: string;
}> = [
  {
    value: "active",
    label: "Active",
    description: "Available and working",
    dotClass: "bg-emerald-400",
  },
  {
    value: "away",
    label: "Away",
    description: "Stepped away for now",
    dotClass: "bg-amber-400",
  },
  {
    value: "dnd",
    label: "Do not disturb",
    description: "Focus mode, avoid pings",
    dotClass: "bg-rose-500",
  },
  {
    value: "offline",
    label: "Offline",
    description: "Not currently available",
    dotClass: "bg-zinc-500",
  },
];

export function getActivityStatusMeta(status: string | null | undefined) {
  return ACTIVITY_STATUS_OPTIONS.find((option) => option.value === status) ?? ACTIVITY_STATUS_OPTIONS[0];
}

