/** The green / amber / red timing signal — the club's visual signature. */
export function TimingLights({ size = 10, className = '', animate = false }: { size?: number; className?: string; animate?: boolean }) {
  const colors = ['var(--go)', 'var(--wait)', 'var(--stop)'];
  return (
    <span className={`inline-flex items-center gap-[0.4em] ${className}`} aria-hidden>
      {colors.map((c, i) => (
        <span
          key={c}
          className="inline-block rounded-full"
          style={{
            width: size,
            height: size,
            background: c,
            animation: animate ? `glow 2.4s ease-in-out ${i * 0.8}s infinite` : undefined,
          }}
        />
      ))}
    </span>
  );
}
