import { expect, it } from "vitest";
import { emailTemplates } from "./templates.ts";

it.each(["resetPassword", "verifyEmail"] as const)(
  "renders %s with escaped HTML and a plain text link",
  async (key) => {
    const user = { name: "<img src=x onerror=\"alert(1)\"> & 'Name'", email: "a@example.com" };
    const url = 'https://example.com/auth?token=a&callback="quoted"';
    const result = await emailTemplates[key]({ user, url });
    expect(result.subject).toBeTruthy();
    expect(result.text).toContain(user.name);
    expect(result.text).toContain(url);
    expect(result.html).toContain("&lt;img");
    expect(result.html).toContain("&amp;");
    expect(result.html).toContain("&#39;Name&#39;");
    expect(result.html).toContain(
      'href="https://example.com/auth?token=a&amp;callback=&quot;quoted&quot;"',
    );
    expect(result.html).not.toContain("<img");
  },
);
