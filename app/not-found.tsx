import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="container page">
      <section className="empty stack" style={{ alignItems: "center", padding: 48 }}>
        <h1 style={{ fontSize: 32 }}>Lost in the Barrow Deeps</h1>
        <p>That page doesn&apos;t exist. It may have moved, or the link is wrong.</p>
        <Link href="/" className="btn btn-primary">Back to guild home</Link>
      </section>
    </main>
  );
}
