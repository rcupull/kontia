import * as Popover from "@radix-ui/react-popover";
import React, { useMemo, useState, type ReactNode } from "react";
import { useFormContext, type FieldError, type UseFormRegisterReturn } from "react-hook-form";
import { useDebouncer } from "../../hooks/useDebouncer";
import { cn } from "../../utils/general";

export interface FieldSelectProps<O extends any = any> {
  label: string;
  register: UseFormRegisterReturn<any>;
  error?: FieldError;
  className?: string;
  options: Array<O>;
  renderOption?: (option: O, index: number) => React.ReactNode;
  isSearchable?: boolean;
  onSearch?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  searchDebounceMs?: number;
  getOptionValue?: (option: O) => string | number;
  getOptionLabel?: (option: O) => string;
  getSearchFilter?: (search: string, option: O) => boolean;
  disabled?: boolean;
  bottomElement?: ReactNode;
  onClick?: () => void;
  getExtraOptions?: (options: Array<O>) => Array<O>;
}

export const FieldSelect = <O extends any = any>({ label, register, error, className,
  options: optionsProp, renderOption, bottomElement, isSearchable = false, onSearch,
  placeholder = "Seleccionar...", searchPlaceholder = "Buscar...", getSearchFilter,
  searchDebounceMs = 300, getOptionValue, getOptionLabel, disabled, onClick,
  getExtraOptions }: FieldSelectProps<O>) => {
  const { setValue, watch } = useFormContext();
  const optionValue = getOptionValue ?? ((option: any) => option.value);
  const optionLabel = getOptionLabel ?? ((option: any) => String(option.label));
  const optionRenderer = renderOption ?? ((option: any) => option.label);
  const fieldName = register.name;
  const selectedValue = watch(fieldName);
  const options = getExtraOptions ? getExtraOptions(optionsProp) : optionsProp;
  const selectedOption = useMemo(() => options.find((o) => String(optionValue(o)) === String(selectedValue)), [options, selectedValue, optionValue]);
  const [search, setSearch] = useState("");
  const debouncer = useDebouncer();
  const [open, setOpen] = useState(false);
  const displayLabel = selectedOption ? optionLabel(selectedOption) : placeholder;
  const filteredOptions = getSearchFilter ? options.filter((o) => getSearchFilter(search, o)) : options;
  return <div className={cn("flex w-full min-w-0 max-w-full flex-col items-start", className)}><label className="mb-1 text-sm font-bold">{label}</label>
    <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button type="button" disabled={disabled}
      onClick={() => { onClick?.(); if (!disabled) setOpen((value) => !value); }}
      className={cn("w-full min-w-0 max-w-full rounded-2xl border px-4 py-3 text-left focus:outline-none focus:ring-4 focus:ring-emerald-600/10",
        error ? "border-red-500" : "border-slate-200", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
      <span className="block truncate">{displayLabel}</span></button></Popover.Trigger>
      <Popover.Portal><Popover.Content side="bottom" align="start" sideOffset={6}
        className="z-[9999] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white shadow-xl">
        {isSearchable && <div className="border-b p-2"><input value={search} onChange={(event) => {
          const value = event.target.value; setSearch(value); debouncer(() => onSearch?.(value), searchDebounceMs);
        }} placeholder={searchPlaceholder} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-600" autoFocus /></div>}
        <div className="max-h-64 overflow-auto">{filteredOptions.length === 0 ? <div className="p-3 text-sm text-gray-500">Sin resultados</div>
          : filteredOptions.map((option, index) => { const value = optionValue(option); const isSelected = String(value) === String(selectedValue);
            return <button key={`${String(value)}-${index}`} type="button" onClick={() => {
              setValue(fieldName, value, { shouldDirty: true, shouldTouch: true, shouldValidate: true }); setOpen(false);
            }} className={cn("w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50", isSelected && "bg-gray-100")}>{optionRenderer(option, index)}</button>;
          })}{bottomElement}</div></Popover.Content></Popover.Portal></Popover.Root>
    <input type="hidden" {...register} />{error && <p className="mt-1 text-sm text-red-500">{error.message}</p>}</div>;
};
