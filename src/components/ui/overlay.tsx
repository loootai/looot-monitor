"use client";

import * as React from "react";
import { Dialog as D, DropdownMenu as M, Tooltip as T, Switch as S } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

/** Centred dialog, or a sheet from the right with side="right". Sheets fill the width on phones. */
export function DialogContent({ title, description, children, className, side = "center", hideTitle }: { title: string; description?: string; children: React.ReactNode; className?: string; side?: "center" | "right" | "bottom"; hideTitle?: boolean }) {
  const pos = {
    center: "left-1/2 top-[12vh] w-[calc(100vw-24px)] max-w-lg -translate-x-1/2 rounded-panel border",
    right: "right-0 top-0 h-dvh w-full max-w-md border-l",
    bottom: "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-panel border-t",
  }[side];
  return (
    <D.Portal>
      <D.Overlay className="fade fixed inset-0 z-40 bg-[rgb(6_20_15/0.45)]" />
      <D.Content className={cn("pop fixed z-50 flex flex-col overflow-hidden border-line bg-panel text-ink shadow-pop focus:outline-none", pos, className)}>
        <div className={cn("flex items-start justify-between gap-4 border-b border-line px-4 py-3", hideTitle && "sr-only")}>
          <div className="min-w-0">
            <D.Title className="text-14 font-medium">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-12 text-mute">{description}</D.Description> : null}
          </div>
          <D.Close aria-label="Close" className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-control text-mute hover:bg-hover hover:text-ink">
            <X className="size-4" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ className, align = "end", ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={4} className={cn("pop z-50 min-w-44 rounded-panel border border-line bg-panel p-1 text-13 text-ink shadow-pop", className)} {...props} />
    </M.Portal>
  );
}

export function MenuItem({ className, danger, ...props }: React.ComponentProps<typeof M.Item> & { danger?: boolean }) {
  return <M.Item className={cn("flex h-9 cursor-pointer select-none items-center gap-2 rounded-[4px] px-2 outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-hover data-[disabled]:opacity-50 md:h-8 [&_svg]:size-4 [&_svg]:text-mute", danger && "text-high [&_svg]:text-high", className)} {...props} />;
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2 py-1.5 text-11 text-mute", className)} {...props} />;
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-line" />;
}

export const TooltipProvider = T.Provider;

/** Hover and focus hint. Keep the text short. */
export function Tip({ label, children, side = "top" }: { label: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="fade z-50 max-w-64 rounded-control border border-line bg-panel px-2 py-1 text-12 text-ink shadow-pop">
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-line-strong transition-colors duration-100 data-[state=checked]:bg-brand", className)} {...props}>
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-panel transition-transform duration-100 data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  );
}
