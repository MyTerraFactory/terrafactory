import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-600/50 bg-slate-800 px-3 text-sm font-medium text-slate-100 shadow-[0_8px_22px_rgba(2,6,23,0.16)] transition hover:-translate-y-0.5 hover:border-teal-300/70 hover:bg-slate-700 hover:shadow-[0_12px_28px_rgba(45,212,191,0.14)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
