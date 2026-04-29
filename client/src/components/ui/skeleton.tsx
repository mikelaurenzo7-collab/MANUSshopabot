import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden bg-white/[0.04] rounded-md before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer-slide_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
