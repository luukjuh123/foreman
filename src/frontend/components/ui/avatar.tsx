import * as React from "react";
import { cn } from "@/lib/utils";

const AVATAR_GRADIENTS = [
  "from-amber-500 to-orange-600",
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-sky-600",
];

function getGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CLASSES: Record<AvatarSize, { container: string; text: string }> = {
  xs: { container: "h-7 w-7 rounded-lg", text: "text-[10px]" },
  sm: { container: "h-9 w-9 rounded-lg", text: "text-xs" },
  md: { container: "h-11 w-11 rounded-xl", text: "text-sm" },
  lg: { container: "h-14 w-14 rounded-xl", text: "text-base" },
  xl: { container: "h-20 w-20 rounded-2xl", text: "text-xl" },
};

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  src?: string | null;
  size?: AvatarSize;
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ name, src, size = "md", className, ...props }, ref) => {
    const sizeClass = SIZE_CLASSES[size];
    const gradient = getGradient(name);
    const initials = getInitials(name);

    if (src) {
      return (
        <div
          ref={ref}
          className={cn(
            "shrink-0 overflow-hidden bg-muted",
            sizeClass.container,
            className
          )}
          {...props}
        >
          <img
            src={src}
            alt={name}
            className="h-full w-full object-cover"
          />
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          "shrink-0 flex items-center justify-center bg-gradient-to-br text-white font-bold shadow-sm",
          sizeClass.container,
          sizeClass.text,
          gradient,
          className
        )}
        title={name}
        {...props}
      >
        {initials}
      </div>
    );
  }
);
Avatar.displayName = "Avatar";

export { Avatar, getInitials, getGradient };
export type { AvatarSize };
