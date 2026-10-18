'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="card">
      <h1>页面渲染出错</h1>
      <p className="bad">{error.message}</p>
      {error.digest !== undefined && (
        <p className="muted">
          digest: <code>{error.digest}</code>
        </p>
      )}
      <button className="button" type="button" onClick={reset}>
        重试
      </button>
    </section>
  );
}
