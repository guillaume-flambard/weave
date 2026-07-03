export type Locale = "en" | "fr";

export const LOCALES: { code: Locale; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
];

export const LOCALE_STORAGE_KEY = "weave_locale";
export const DEFAULT_LOCALE: Locale = "fr";

export type MessageTree = {
  readonly [key: string]: string | readonly string[] | MessageTree;
};

export type Messages = MessageTree;
