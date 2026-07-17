export function Movement({ delta }: { delta: number | null | undefined }) {
  if (delta === null || delta === undefined) return <span className="mv mv-none">–</span>;
  if (delta > 0) return <span className="mv mv-up" title={`Up ${delta}`}>▲{delta}</span>;
  if (delta < 0) return <span className="mv mv-down" title={`Down ${-delta}`}>▼{-delta}</span>;
  return <span className="mv mv-flat" title="No change">–</span>;
}
