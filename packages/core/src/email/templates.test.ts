import { expect, it } from "vitest";
import { emailTemplates } from "./templates.ts";

it.each(["resetPassword", "verifyEmail", "signInLink", "magicLink"] as const)(
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

it("renders the invite with the inviter, role, site and link, HTML escaped", async () => {
  const result = await emailTemplates.invite({
    email: "new@example.com",
    role: { name: "editor", label: "Editor" },
    url: "https://example.com/admin/invite?token=a&b",
    inviter: { name: "<b>Ada</b>", email: "ada@example.com" },
    site: "Tom & Jerry",
  });
  expect(result.subject).toBe("You are invited to Tom & Jerry");
  expect(result.text).toContain("<b>Ada</b> invited you to Tom & Jerry as Editor.");
  expect(result.text).toContain("https://example.com/admin/invite?token=a&b");
  expect(result.html).toContain("&lt;b&gt;Ada&lt;/b&gt;");
  expect(result.html).toContain("Tom &amp; Jerry");
  expect(result.html).toContain('href="https://example.com/admin/invite?token=a&amp;b"');
  expect(result.html).not.toContain("<b>");
});

it.each([
  ["sign-in", "Your sign-in code"],
  ["email-verification", "Verify your email address"],
  ["forget-password", "Reset your password"],
  ["change-email", "Confirm your new email address"],
] as const)("words the %s code", async (type, subject) => {
  const result = await emailTemplates.emailOtp({ email: "a@example.com", otp: "123456", type });
  expect(result.subject).toBe(subject);
  expect(result.text).toContain("123456");
  expect(result.html).toContain("123456");
});
