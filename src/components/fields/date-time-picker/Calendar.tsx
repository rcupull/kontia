import { addDays } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarBase } from "react-date-range";

export interface CalendarProps {
  allowDaysAfterNow?: number;
  allowDaysBeforeNow?: number;
  value?: Date;
  onChange?: (value: Date) => void;
  minDate?: string;
  maxDate?: string;
  className?: string;
  defaultHours?: "start" | "end";
}

export function Calendar({ value, onChange, allowDaysBeforeNow, allowDaysAfterNow,
  minDate, maxDate, className, defaultHours = "start" }: CalendarProps) {
  const allowedMinDate = allowDaysBeforeNow === undefined ? undefined : addDays(new Date(), -allowDaysBeforeNow);
  const allowedMaxDate = allowDaysAfterNow === undefined ? undefined : addDays(new Date(), allowDaysAfterNow);
  const realMinDate = allowedMinDate ?? (minDate ? new Date(minDate) : undefined);
  const realMaxDate = allowedMaxDate ?? (maxDate ? new Date(maxDate) : undefined);
  return <CalendarBase date={value} locale={es} onChange={(nextDate: Date) => {
    if (value) nextDate.setHours(value.getHours(), value.getMinutes(), value.getSeconds(), value.getMilliseconds());
    else nextDate.setHours(...(defaultHours === "start" ? [0, 0, 0, 0] as const : [23, 59, 59, 999] as const));
    onChange?.(new Date(nextDate));
  }} minDate={realMinDate} maxDate={realMaxDate} className={className} />;
}
