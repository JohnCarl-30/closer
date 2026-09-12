function base64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function accessToken(env: {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
}): Promise<string> {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Google token ${res.status}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export function createGmailClient(env: {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
}) {
  async function authHeaders() {
    const token = await accessToken(env);
    return { Authorization: `Bearer ${token}` };
  }

  return {
    async send(input: {
      to: string;
      subject: string;
      body: string;
    }): Promise<{ id: string }> {
      const raw = [
        `To: ${input.to}`,
        `Subject: ${input.subject}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        input.body,
      ].join("\r\n");
      const res = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            ...(await authHeaders()),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: base64url(raw) }),
        },
      );
      if (!res.ok) throw new Error(`Gmail send ${res.status}`);
      const json = (await res.json()) as { id: string };
      return { id: json.id };
    },
    async findSent(input: {
      to: string;
      sinceUnix: number;
      subject: string;
    }): Promise<{ id: string } | null> {
      const q = [
        "in:sent",
        `to:${input.to}`,
        `subject:"${input.subject.replaceAll('"', "")}"`,
        `after:${input.sinceUnix}`,
      ].join(" ");
      const url = new URL(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages",
      );
      url.searchParams.set("q", q);
      url.searchParams.set("maxResults", "5");
      const res = await fetch(url, { headers: await authHeaders() });
      if (!res.ok) throw new Error(`Gmail list ${res.status}`);
      const json = (await res.json()) as { messages?: { id: string }[] };
      const id = json.messages?.[0]?.id;
      return id ? { id } : null;
    },
  };
}
