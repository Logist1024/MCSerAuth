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
      <p className="muted">页面加载时发生异常，请稍后重试；若问题持续，请联系管理员。</p>
      {error.digest !== undefined && (
        <p className="muted small">
          错误编号：<code>{error.digest}</code>
        </p>
      )}
      <button className="button" type="button" onClick={reset}>
        重试
      </button>
    </section>
  );
}
