import "server-only";

/** Post to the #raid-signups webhook. Silently skipped when no webhook is configured. */
export async function postToDiscord(content: string, embed?: { title: string; description?: string; url?: string; timestamp?: string }) {
  const url = process.env.DISCORD_SIGNUPS_WEBHOOK_URL;
  if (!url) return { posted: false as const };
  const res = await fetch(url + "?wait=true", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, embeds: embed ? [{ color: 0xe3b341, ...embed }] : undefined, allowed_mentions: { parse: [] } }),
  });
  if (!res.ok) throw new Error(`Discord webhook failed: ${res.status}`);
  const j = await res.json().catch(() => ({}));
  return { posted: true as const, messageId: j.id as string | undefined };
}
