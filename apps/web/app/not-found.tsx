import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 bg-bg">
      <div className="max-w-[420px] w-full text-center border border-line rounded-2xl bg-surface p-8 box-border wv-fade-in">
        <FileQuestion size={28} className="mx-auto text-muted" strokeWidth={1.75} />
        <h1 className="mt-4 text-lg font-semibold text-ink m-0">Page introuvable</h1>
        <p className="mt-2 text-sm text-ink-soft leading-relaxed m-0">
          Cette page n&apos;existe pas ou a été déplacée.
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 no-underline text-sm font-medium text-accent-deep bg-accent-soft border border-[color-mix(in_srgb,var(--accent)_30%,var(--line))] rounded-lg px-4 py-2.5 transition-colors hover:bg-[color-mix(in_srgb,var(--accent-soft)_80%,white)]"
          >
            <ArrowLeft size={15} />
            Retour à la conversation
          </Link>
        </div>
      </div>
    </div>
  );
}
