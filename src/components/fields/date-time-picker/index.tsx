import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../../../utils/general";
import { Calendar, type CalendarProps } from "./Calendar";

export interface DateTimePickerProps extends CalendarProps {
  collapsable?: boolean; clearable?: boolean; emptyLabel?: string; onClear?: () => void;
}

export function DateTimePicker({ collapsable = true, clearable = false, emptyLabel = "Sin fecha",
  onClear, ...calendarProps }: DateTimePickerProps) {
  const { value, onChange } = calendarProps;
  const [open, setOpen] = useState(false); const [state, setState] = useState<Date>();
  useEffect(() => setState(value), [value]);
  function handleChange(nextValue: Date) { setState(nextValue); setOpen(false); onChange?.(nextValue); }
  if (!collapsable) return <Calendar {...calendarProps} value={state} onChange={handleChange} />;
  return <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><div
    className={cn("flex w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-left focus:outline-none focus:ring-4 focus:ring-emerald-600/10")}
    role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setOpen(true); }}>
    <span className={state ? "text-slate-900" : "text-slate-400"}>{state ? state.toLocaleDateString("es", { year: "numeric", month: "2-digit", day: "2-digit" }) : emptyLabel}</span>
    <span className="flex items-center gap-1">{clearable && state && <button type="button" className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100" aria-label="Limpiar fecha" onClick={(event) => { event.stopPropagation(); setState(undefined); onClear?.(); }}><X className="size-4" /></button>}<CalendarDays className="size-4 text-slate-400" /></span>
  </div></Popover.Trigger><Popover.Portal><Popover.Content side="bottom" align="start" sideOffset={6} collisionPadding={12}
    className="z-[9999] max-w-[calc(100vw-2rem)] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
    <Calendar {...calendarProps} value={state} onChange={handleChange} />
  </Popover.Content></Popover.Portal></Popover.Root>;
}
