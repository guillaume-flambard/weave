import type { Locale, Messages } from "./types";
import { messages as en } from "./locales/en";
import { messages as fr } from "./locales/fr";

const catalogs: Record<Locale, Messages> = { en, fr };

function resolve(obj: unknown, path: string): string | undefined {
  const value = path.split(".").reduce<unknown>((node, key) => {
    if (node && typeof node === "object" && key in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
  return typeof value === "string" ? value : undefined;
}

export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const text = resolve(catalogs[locale], key) ?? resolve(catalogs.en, key) ?? key;
  if (!vars) return text;
  return Object.entries(vars).reduce(
    (out, [name, value]) => out.replaceAll(`{${name}}`, String(value)),
    text,
  );
}

export function translateList(locale: Locale, key: string): readonly string[] {
  const value = key.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, catalogs[locale]);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
