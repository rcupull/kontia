import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { FieldInput, type FieldInputProps } from "./FieldInput";

export function FieldInputPassword(
  props: Omit<FieldInputProps, "type" | "endSvg" | "endSvgClick">,
) {
  const [visible, setVisible] = useState(false);
  return (
    <FieldInput
      {...props}
      type={visible ? "text" : "password"}
      endSvg={visible ? EyeOff : Eye}
      endSvgClick={() => setVisible((value) => !value)}
    />
  );
}
