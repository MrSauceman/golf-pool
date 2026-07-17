import { fmtScore, scoreClass } from '../lib/format';

export function Score({
  value,
  strong,
  className = '',
}: {
  value: number | null | undefined;
  strong?: boolean;
  className?: string;
}) {
  return (
    <span className={`score ${scoreClass(value)} ${strong ? 'score-strong' : ''} ${className}`}>
      {fmtScore(value)}
    </span>
  );
}
