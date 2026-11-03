import { useEffect, useState } from 'react';

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `已等待 ${seconds} 秒`;
  return `已等待 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

/** A clock under a batch being made, so a long wait reads as progress rather than a hang. */
export function GenerationElapsed({ startedAt }: { startedAt: string }) {
  const started = Date.parse(startedAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  return <p className="generation-elapsed">{formatElapsed(seconds)}</p>;
}
