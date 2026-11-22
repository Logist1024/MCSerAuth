export default function AdminLoading() {
  return (
    <section className="card" aria-busy="true" aria-live="polite">
      <span className="sr-only">正在加载管理后台…</span>
      <div className="skeleton-stack" aria-hidden="true">
        <span className="skeleton-line" style={{ width: '8rem' }} />
        <span className="skeleton-line" style={{ width: 'min(20rem, 70%)' }} />
      </div>
      <div className="skeleton-panel" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <div className="skeleton-row" key={index}>
            <span className="skeleton-avatar" />
            <div className="skeleton-stack">
              <span className="skeleton-line" style={{ width: '36%' }} />
              <span className="skeleton-line" style={{ width: '78%' }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
