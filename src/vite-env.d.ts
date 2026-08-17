/// <reference types="vite/client" />

declare module "lucide-react" {
  import type { ComponentType, SVGProps } from "react";
  type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
  export const AlertTriangle: Icon;
  export const Boxes: Icon;
  export const LoaderCircle: Icon;
  export const LogOut: Icon;
  export const PackagePlus: Icon;
  export const Plus: Icon;
  export const Search: Icon;
}
