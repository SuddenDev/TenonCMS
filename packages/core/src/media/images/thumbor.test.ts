import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { src } from "./hosted.fixture.ts";
import { thumbor } from "./thumbor.ts";

const baseURL = "https://thumbor.example.com";

describe("thumbor", () => {
  it("maps fit to fit-in, full-fit-in or a crop", () => {
    const { getImage } = thumbor({ baseURL });
    expect(
      getImage(src, { width: 640, height: 320, fit: "inside", format: "webp", quality: 80 }).url,
    ).toBe(
      `${baseURL}/unsafe/fit-in/640x320/filters:format(webp):quality(80)/_tenon/media/files/a%20b/x.jpg`,
    );
    expect(
      getImage(src, { width: 640, height: 320, fit: "contain", background: "ffffff" }).url,
    ).toBe(`${baseURL}/unsafe/fit-in/640x320/filters:fill(ffffff)/_tenon/media/files/a%20b/x.jpg`);
    expect(getImage(src, { width: 640, fit: "outside" }).url).toBe(
      `${baseURL}/unsafe/full-fit-in/640x0/_tenon/media/files/a%20b/x.jpg`,
    );
    expect(getImage(src, { width: 640, height: 320, format: "jpg" }).url).toBe(
      `${baseURL}/unsafe/640x320/filters:format(jpeg)/_tenon/media/files/a%20b/x.jpg`,
    );
  });

  it("signs the path with HMAC-SHA1 and makes the file URL absolute with `origin`", () => {
    const path = "640x0/https://example.com/_tenon/media/files/a%20b/x.jpg";
    const signature = createHmac("sha1", "secret").update(path).digest("base64url");
    const padded = signature.padEnd(Math.ceil(signature.length / 4) * 4, "=");
    expect(
      thumbor({ baseURL, key: "secret", origin: "https://example.com" }).getImage(src, {
        width: 640,
      }).url,
    ).toBe(`${baseURL}/${padded}/${path}`);
  });
});
