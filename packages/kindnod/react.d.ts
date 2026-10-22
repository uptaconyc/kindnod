import type { ReactNode } from "react";
import type { Consent, Category, LoadOptions } from "./index";
export function KindnodConsent(props: LoadOptions): null;
export function useConsent(): Consent | null;
export function Gated(props: { category: Category; children: ReactNode; fallback?: ReactNode }): ReactNode;
