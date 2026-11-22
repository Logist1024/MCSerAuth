export default function GrowthLoading() {
  return (
    <section className="card" aria-busy="true" aria-live="polite">
      <span className="sr-only">正在加载成长中心…</span>
      <div className="skeleton-stack" aria-hidden="true">
        <span className="skeleton-line" style={{ width: '7rem' }} />
        <span className="skeleton-line" style={{ width: 'min(18rem, 80%)' }} />
      </div>
      <div className="skeleton-panel" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <div className="skeleton-row" key={index}>
            <span className="skeleton-avatar" />
            <div className="skeleton-stack">
              <span className="skeleton-line" style={{ width: '42%' }} />
              <span className="skeleton-line" style={{ width: '86%' }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
