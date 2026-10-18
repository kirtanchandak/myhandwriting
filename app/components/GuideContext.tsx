"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { DEFAULTS, buildGuide, type WritingGuide } from "@/lib/template/guide";

type GuideState = { guide: WritingGuide; variants: number; setVariants: (v: number) => void };

const Ctx = createContext<GuideState | null>(null);

export function GuideProvider({ children }: { children: React.ReactNode }) {
  const [variants, setVariants] = useState(DEFAULTS.variants);
  const guide = useMemo(() => buildGuide({ variants }), [variants]);
  const value = useMemo(() => ({ guide, variants, setVariants }), [guide, variants]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGuide(): GuideState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGuide must be used inside GuideProvider");
  return v;
}
