export default function NotificationsLoading() {
  return (
    <section className="panel" aria-busy="true" aria-live="polite">
      <span className="sr-only">正在加载通知…</span>
      <div className="loading-state" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <div className="skeleton-line" key={index} />
        ))}
      </div>
    </section>
  );
}
