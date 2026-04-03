import { describe, expect, test, beforeEach, afterEach } from "bun:test";

// We need to re-import the module after setting env
let generateToken: any;
let verifyToken: any;

describe("JWT Integration Test", () => {
  const originalEnv = process.env.JWT_SECRET;

  beforeEach(async () => {
    process.env.JWT_SECRET = "test-secret-key-for-testing";
    // Re-import to get fresh module with new env
    const jwtModule = await import("../src/auth/jwt.ts");
    generateToken = jwtModule.generateToken;
    verifyToken = jwtModule.verifyToken;
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.JWT_SECRET = originalEnv;
    } else {
      delete process.env.JWT_SECRET;
    }
  });

  test("should generate valid token", async () => {
    const token = await generateToken("alice");
    expect(token).toBeDefined();
    expect(token.split(".").length).toBe(3); // JWT has 3 parts
  });

  test("should verify valid token", async () => {
    const token = await generateToken("alice");
    const payload = await verifyToken(token);

    expect(payload).not.toBeNull();
    expect(payload?.username).toBe("alice");
    expect(payload?.exp).toBeDefined();
  });

  test("should return null for invalid token", async () => {
    const payload = await verifyToken("invalid.token.here");
    expect(payload).toBeNull();
  });

  test("should return null for expired token", async () => {
    const token = await generateToken("alice", "-1s"); // Already expired
    const payload = await verifyToken(token);
    expect(payload).toBeNull();
  });

  test("should generate token with custom expiration", async () => {
    const token = await generateToken("alice", "1h");
    const payload = await verifyToken(token);

    expect(payload).not.toBeNull();
    expect(payload?.username).toBe("alice");
  });
});
