export type Category = "necessary" | "preferences" | "statistics" | "marketing";
export interface Consent { necessary: true; preferences: boolean; statistics: boolean; marketing: boolean; method: "explicit" | "implied" | "carried" | "gpc" }
export interface LoadOptions {
  /** Site key from the dashboard. Omit it and the site is provisioned on first load (keyless). */
  siteKey?: string;
  /** Owner email. Kindnod emails a link to claim the dashboard. */
  owner?: string;
  /** Which tool installed it, for attribution. Defaults to "npm". */
  via?: string;
  /** Inline config overrides (position, theme, texts, regions). */
  config?: Record<string, unknown>;
  /** Self-hosted banner URL. Defaults to https://kindnod.com/kindnod.js */
  src?: string;
}
export interface KindnodApi {
  version: string;
  show(): void;
  hide(): void;
  withdraw(): void;
  accept(c?: Partial<Omit<Consent, "necessary" | "method">>): void;
  reset(): void;
  on(event: "consent", fn: (c: Consent) => void): void;
  readonly consent: Consent | null;
}
export function loadKindnod(opts?: LoadOptions): Promise<KindnodApi | null>;
export function onConsent(fn: (c: Consent) => void): () => void;
export function getConsent(): Consent | null;
export function allowed(category: Category): boolean;
declare global { interface Window { Kindnod?: KindnodApi } }
