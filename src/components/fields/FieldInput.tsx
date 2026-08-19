import type { FunctionComponent, ReactNode } from "react";
import type { FieldError, UseFormRegisterReturn } from "react-hook-form";
import { cn } from "../../utils/general";

export interface FieldInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  register: UseFormRegisterReturn<any>;
  error?: FieldError;
  type?: React.HTMLInputTypeAttribute;
  placeholder?: string;
  className?: string;
  endSvg?: FunctionComponent<{ className?: string }>;
  endSvgClick?: () => void;
  disabled?: boolean;
}

export const FieldInput = ({
  label,
  register,
  error,
  type = "text",
  placeholder,
  className,
  endSvg: EndSvg,
  endSvgClick,
  disabled,
  ...props
}: FieldInputProps) => (
  <div className={cn("flex w-full min-w-0 flex-col items-start", className)}>
    <label className="text-sm font-bold">{label}</label>
    <div className="relative w-full min-w-0">
      <input
        type={type}
        step={type === "number" ? "any" : undefined}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "block w-full min-w-0 max-w-full rounded-2xl border px-4 py-3 focus:outline-none focus:ring-4 focus:ring-emerald-600/10 disabled:cursor-not-allowed disabled:bg-gray-200",
          {
            "border-red-500": error,
            "border-slate-200 focus:border-emerald-600": !error,
            "pr-10": EndSvg,
          },
        )}
        onWheel={(e) => e.currentTarget.blur()}
        {...register}
        {...props}
      />
      {EndSvg && (
        <button
          type="button"
          onClick={endSvgClick}
          className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
        >
          <EndSvg className="h-5 w-5" />
        </button>
      )}
    </div>
    {error && <p className="text-sm text-red-500">{error.message}</p>}
  </div>
);
