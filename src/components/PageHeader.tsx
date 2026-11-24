import { TimingLights } from './TimingLights';

export function PageHeader({ eyebrow, title, intro }: { eyebrow: string; title: React.ReactNode; intro?: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-12 pt-14 sm:px-6 md:pt-20">
      <p className="rise flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em] text-ink-soft">
        <TimingLights size={7} /> {eyebrow}
      </p>
      <h1 className="rise mt-5 max-w-4xl font-display text-[clamp(2.5rem,6vw,4.5rem)] font-semibold leading-[0.98] tracking-[-0.02em]" style={{ animationDelay: '80ms' }}>
        {title}
      </h1>
      {intro && (
        <p className="rise mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft" style={{ animationDelay: '160ms' }}>
          {intro}
        </p>
      )}
    </div>
  );
}
