import { describe, it, expect } from "bun:test";

import { buildPublicCloneUrl } from "../src/domain/vcs/clone-url.js";

describe("buildPublicCloneUrl", () => {
  const sessionId = "abc123";
  const internalUrl = "http://platform:8000/abc123.git/";
  const platformUrl = "https://mimo.example.com:3000";

  it("uses the public VCS base when configured (reverse-proxy deployment)", () => {
    const url = buildPublicCloneUrl({
      internalUrl,
      platformUrl,
      publicVcsUrl: "https://mimo.example.com/git",
      sessionId,
    });
    expect(url).toBe("https://mimo.example.com/git/abc123.git/");
  });

  it("trims trailing slashes from the public base", () => {
    const url = buildPublicCloneUrl({
      internalUrl,
      platformUrl,
      publicVcsUrl: "https://mimo.example.com/git///",
      sessionId,
    });
    expect(url).toBe("https://mimo.example.com/git/abc123.git/");
  });

  it("swaps the internal hostname to the platform's when no public base is set", () => {
    const url = buildPublicCloneUrl({
      internalUrl,
      platformUrl,
      sessionId,
    });
    expect(url).toBe("http://mimo.example.com:8000/abc123.git/");
  });

  it("falls back to the internal URL when inputs cannot be parsed", () => {
    const url = buildPublicCloneUrl({
      internalUrl,
      platformUrl: "not a url",
      sessionId,
    });
    expect(url).toBe(internalUrl);
  });
});
