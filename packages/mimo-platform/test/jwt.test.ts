import { describe, expect, test } from "bun:test";
import { JwtService } from "../src/auth/jwt.ts";

describe("JWT Service", () => {
  test("should generate valid token", async () => {
    const jwtService = new JwtService("test-secret-key-for-testing");
    const token = await jwtService.generateToken("alice");
    expect(token).toBeDefined();
    expect(token.split(".").length).toBe(3); // JWT has 3 parts
  });

  test("should verify valid token", async () => {
    const jwtService = new JwtService("test-secret-key-for-testing");
    const token = await jwtService.generateToken("alice");
    const payload = await jwtService.verifyToken(token);

    expect(payload).not.toBeNull();
    expect(payload?.username).toBe("alice");
    expect(payload?.exp).toBeDefined();
  });

  test("should return null for invalid token", async () => {
    const jwtService = new JwtService("test-secret-key-for-testing");
    const payload = await jwtService.verifyToken("invalid.token.here");
    expect(payload).toBeNull();
  });

  test("should return null for expired token", async () => {
    const jwtService = new JwtService("test-secret-key-for-testing");
    const token = await jwtService.generateToken("alice", "-1s"); // Already expired
    const payload = await jwtService.verifyToken(token);
    expect(payload).toBeNull();
  });

  test("should generate token with custom expiration", async () => {
    const jwtService = new JwtService("test-secret-key-for-testing");
    const token = await jwtService.generateToken("alice", "1h");
    const payload = await jwtService.verifyToken(token);

    expect(payload).not.toBeNull();
    expect(payload?.username).toBe("alice");
  });

  test("should use different secrets independently", async () => {
    const serviceA = new JwtService("secret-a");
    const serviceB = new JwtService("secret-b");

    const tokenA = await serviceA.generateToken("alice");
    
    // Token from serviceA should not verify with serviceB
    const payloadFromB = await serviceB.verifyToken(tokenA);
    expect(payloadFromB).toBeNull();

    // Token from serviceA should verify with serviceA
    const payloadFromA = await serviceA.verifyToken(tokenA);
    expect(payloadFromA).not.toBeNull();
    expect(payloadFromA?.username).toBe("alice");
  });
});
