import Link from "next/link";

export default function CharacterNotFound() {
  return (
    <main id="main" tabIndex={-1} className="container page">
      <section className="empty stack" style={{ alignItems: "center" }}>
        <h1 style={{ fontSize: 32 }}>Character not found</h1>
        <p>Characters appear after they reach level 10 and log out once, and the guild roster syncs every 30 minutes.</p>
        <Link href="/roster" className="btn">Browse the roster</Link>
      </section>
    </main>
  );
}
