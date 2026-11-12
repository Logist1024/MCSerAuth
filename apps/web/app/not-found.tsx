import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="card">
      <h1>404 · 页面不存在</h1>
      <p className="muted">你访问的页面不存在，或地址有误。</p>
      <Link className="button" href="/">
        返回首页
      </Link>
    </section>
  );
}
