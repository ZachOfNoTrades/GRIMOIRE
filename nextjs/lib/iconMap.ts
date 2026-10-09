import type { ComponentType } from "react";
import {
  Dumbbell,
  BookOpen,
  Code,
  Target,
  Apple,
  Skull,
  Dices,
} from "lucide-react";
import ForageTreeIcon from "@/components/ui/ForageTreeIcon";
import OracleIcon from "@/components/ui/OracleIcon";

// A module icon is either a Lucide glyph or a mask-rendered artwork; both take only a className.
export type ModuleIcon = ComponentType<{ className?: string }>;

export const iconMap: Record<string, ModuleIcon> = {
  Dumbbell,
  BookOpen,
  Code,
  Target,
  Apple,
  Skull,
  Dices,
  ForageTree: ForageTreeIcon,
  OracleIcon,
};

export const defaultIcon: ModuleIcon = Code;
