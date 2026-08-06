import type { ComponentType } from "react";
import {
  Dumbbell,
  BookOpen,
  Code,
  Target,
  Apple,
} from "lucide-react";
import ForageTreeIcon from "@/components/ui/ForageTreeIcon";

// A module icon is either a Lucide glyph or a mask-rendered artwork; both take only a className.
export type ModuleIcon = ComponentType<{ className?: string }>;

export const iconMap: Record<string, ModuleIcon> = {
  Dumbbell,
  BookOpen,
  Code,
  Target,
  Apple,
  ForageTree: ForageTreeIcon,
};

export const defaultIcon: ModuleIcon = Code;
