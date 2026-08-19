import type { ReactNode, TextareaHTMLAttributes } from "react";
import type { FieldError, UseFormRegisterReturn } from "react-hook-form";
import { cn } from "../../utils/general";

export type FieldTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: ReactNode;
  register: UseFormRegisterReturn;
  error?: FieldError;
};
export function FieldTextarea({
  label,
  register,
  error,
  ...props
}: FieldTextareaProps) {
  return (
    <div className="flex w-full min-w-0 max-w-full flex-col items-start">
      <label className="text-sm font-bold">{label}</label>
      <textarea
        {...register}
        {...props}
        className={cn(
          "block w-full min-w-0 max-w-full resize-y rounded-2xl border px-4 py-3 focus:outline-none focus:ring-4 focus:ring-emerald-600/10",
          {
            "border-red-500": error,
            "border-slate-200 focus:border-emerald-600": !error,
          },
        )}
      />
      {error && <p className="text-sm text-red-500">{error.message}</p>}
    </div>
  );
}
