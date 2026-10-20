import React from "react";
import {
  Sparkles,
  Zap,
  FileText,
  Share2,
  Layers,
  SlidersHorizontal,
} from "lucide-react";

export type WordConstraintMode =
  | "one_sentence"
  | "elevator"
  | "executive"
  | "tweet"
  | "detailed"
  | "custom"
  | "twitter_brevity"
  | "app_store_short"
  | "tagline"
  | "standard_pitch"
  | "detailed_store";

export interface ConstraintPresetConfig {
  id: WordConstraintMode;
  label: string;
  shortName: string;
  maxWords: number;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  platformGuideline: string;
  badge: string;
  maxCharsEstimate: number;
  tooltip: string;
  bgActive?: string;
  borderActive?: string;
  textActive?: string;
}

export const CONSTRAINT_PRESETS: ConstraintPresetConfig[] = [
  {
    id: "one_sentence",
    label: "One-Sentence Hook (10 words)",
    shortName: "1-Sentence",
    maxWords: 10,
    description: "Punchy, single-sentence summary for hero banners and ads.",
    icon: Sparkles,
    platformGuideline: "Hero headlines, subheaders, and elevator pitches",
    badge: "≤ 10 words",
    maxCharsEstimate: 70,
    tooltip: "Punchy one-sentence summary for landing pages and ads.",
    bgActive: "bg-cyan-950/70",
    borderActive: "border-cyan-500",
    textActive: "text-cyan-300",
  },
  {
    id: "elevator",
    label: "Elevator Pitch (20 words)",
    shortName: "Elevator",
    maxWords: 20,
    description: "Crisp 20-word executive value proposition.",
    icon: Zap,
    platformGuideline: "Investor decks, introductions, and product cards",
    badge: "≤ 20 words",
    maxCharsEstimate: 140,
    tooltip: "Crisp 20-word executive value proposition.",
    bgActive: "bg-amber-950/70",
    borderActive: "border-amber-500",
    textActive: "text-amber-300",
  },
  {
    id: "executive",
    label: "Executive Brief (50 words)",
    shortName: "Executive",
    maxWords: 50,
    description: "Comprehensive 50-word overview for stakeholders.",
    icon: FileText,
    platformGuideline: "One-pagers, proposals, and team summaries",
    badge: "≤ 50 words",
    maxCharsEstimate: 350,
    tooltip: "Comprehensive 50-word overview for stakeholders.",
    bgActive: "bg-purple-950/70",
    borderActive: "border-purple-500",
    textActive: "text-purple-300",
  },
  {
    id: "tweet",
    label: "Social Post (30 words)",
    shortName: "Social / X",
    maxWords: 30,
    description: "Engaging social post formatted for Twitter/X and LinkedIn.",
    icon: Share2,
    platformGuideline: "Social media copy, announcements, and threads",
    badge: "≤ 30 words",
    maxCharsEstimate: 220,
    tooltip: "Engaging social post formatted for Twitter/X and LinkedIn.",
    bgActive: "bg-sky-950/70",
    borderActive: "border-sky-500",
    textActive: "text-sky-300",
  },
  {
    id: "detailed",
    label: "Product Overview (100 words)",
    shortName: "Detailed",
    maxWords: 100,
    description: "In-depth functional breakdown of capabilities and features.",
    icon: Layers,
    platformGuideline: "App Store long description and feature deep-dives",
    badge: "≤ 100 words",
    maxCharsEstimate: 700,
    tooltip: "In-depth functional breakdown of capabilities and features.",
    bgActive: "bg-emerald-950/70",
    borderActive: "border-emerald-500",
    textActive: "text-emerald-300",
  },
  {
    id: "custom",
    label: "Custom Limit",
    shortName: "Custom",
    maxWords: 25,
    description: "User-specified word count limit.",
    icon: SlidersHorizontal,
    platformGuideline: "Fine-tune word and character targets via custom slider",
    badge: "Custom",
    maxCharsEstimate: 175,
    tooltip: "User-specified word count limit.",
    bgActive: "bg-slate-800",
    borderActive: "border-slate-500",
    textActive: "text-white",
  },
];
