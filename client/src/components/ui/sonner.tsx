import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Compact notification chrome — single-line toasts feel snappier
      // and stack better when an action triggers a burst of updates.
      toastOptions={{
        classNames: {
          toast:
            "!gap-2 !px-3 !py-2 !rounded-md !text-[12.5px] !font-medium !min-h-0 !border !border-white/[0.08]",
          title: "!text-[12.5px] !font-semibold !leading-tight",
          description: "!text-[11px] !text-white/55 !leading-snug",
          actionButton: "!h-6 !px-2 !text-[11px]",
          cancelButton: "!h-6 !px-2 !text-[11px]",
          icon: "!w-3.5 !h-3.5",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
