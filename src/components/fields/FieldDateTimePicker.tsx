import type { ReactNode } from "react";
import {
  useFormContext,
  type FieldError,
  type UseFormRegisterReturn,
} from "react-hook-form";
import { cn } from "../../utils/general";
import { DateTimePicker, type DateTimePickerProps } from "./date-time-picker";

export interface FieldDateTimePickerProps extends Omit<
  DateTimePickerProps,
  "value" | "onChange" | "onClear"
> {
  label: ReactNode;
  register: UseFormRegisterReturn<any>;
  error?: FieldError;
  className?: string;
  valueFormat?: "iso" | "date";
}
function parseDate(value: unknown, format: "iso" | "date") {
  if (typeof value !== "string" || !value) return undefined;
  if (format === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
function serializeDate(date: Date, format: "iso" | "date") {
  if (format === "iso") return date.toISOString();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function FieldDateTimePicker({
  label,
  register,
  error,
  className,
  valueFormat = "iso",
  clearable,
  ...props
}: FieldDateTimePickerProps) {
  const { setValue, watch } = useFormContext();
  const fieldName = register.name;
  const value = watch(fieldName);
  return (
    <div className={cn("flex w-full min-w-0 flex-col items-start", className)}>
      <label className="text-sm font-bold">{label}</label>
      <DateTimePicker
        {...props}
        clearable={clearable}
        value={parseDate(value, valueFormat)}
        onChange={(date) =>
          setValue(fieldName, serializeDate(date, valueFormat), {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          })
        }
        onClear={() =>
          setValue(fieldName, "", {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          })
        }
      />
      <input type="hidden" {...register} />
      {error && <p className="mt-1 text-sm text-red-500">{error.message}</p>}
    </div>
  );
}
