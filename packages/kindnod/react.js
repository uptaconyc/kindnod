"use client";
// React / Next.js (app or pages router). Render once near the root:
//   <KindnodConsent />                          keyless
//   <KindnodConsent owner="you@example.com" />  claim link by email
//   <KindnodConsent siteKey="abc123" />
// and gate scripts with <Gated category="statistics">...</Gated> or useConsent().
import { createElement, useEffect, useState } from "react";
import { loadKindnod, onConsent, getConsent } from "./index.js";

export function KindnodConsent(props) {
  useEffect(() => { loadKindnod({ ...props, via: props.via || "react" }).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function useConsent() {
  const [c, setC] = useState(() => getConsent());
  useEffect(() => onConsent(setC), []);
  return c;
}

// Renders children only after the visitor allowed `category`. Use it around analytics or pixels.
export function Gated({ category, children, fallback = null }) {
  const c = useConsent();
  return c && c[category] ? createElement(Fragment, null, children) : fallback;
}
const Fragment = Symbol.for("react.fragment");
