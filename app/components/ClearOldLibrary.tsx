"use client";

import { useEffect } from "react";
import { LIBRARY_KEY } from "@/lib/store/library";

/** Drops the pre-account letter library. Fonts now live in the database. */
export function ClearOldLibrary() {
  useEffect(() => {
    localStorage.removeItem(LIBRARY_KEY);
  }, []);
  return null;
}
