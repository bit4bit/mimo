import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync } from "fs";


let userRepository: any;

describe("User Repository Integration Test", () => {
  let testHome: string;

  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({ env: { MIMO_HOME: testHome } });
    userRepository = ctx.repos.users;
  });

  afterEach(() => {
    if (existsSync(testHome)) {
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  test("should create a new user", async () => {
    const passwordHash = await Bun.password.hash("secret123", { algorithm: "bcrypt", cost: 10 });
    const user = await userRepository.create("alice", passwordHash);

    expect(user.username).toBe("alice");
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  test("should check if user exists", async () => {
    const passwordHash = await Bun.password.hash("secret123", { algorithm: "bcrypt", cost: 10 });
    await userRepository.create("alice", passwordHash);

    expect(await userRepository.exists("alice")).toBe(true);
    expect(await userRepository.exists("bob")).toBe(false);
  });

  test("should throw error when creating duplicate user", async () => {
    const passwordHash = await Bun.password.hash("secret123", { algorithm: "bcrypt", cost: 10 });
    await userRepository.create("alice", passwordHash);

    expect(userRepository.create("alice", passwordHash)).rejects.toThrow(
      'User "alice" already exists',
    );
  });

  test("should get user credentials", async () => {
    const passwordHash = await Bun.password.hash("secret123", { algorithm: "bcrypt", cost: 10 });
    await userRepository.create("alice", passwordHash);

    const creds = await userRepository.getCredentials("alice");
    expect(creds).not.toBeNull();
    expect(creds?.username).toBe("alice");
    expect(creds?.passwordHash).toBe(passwordHash);
  });

  test("should return null for non-existent user", async () => {
    const creds = await userRepository.getCredentials("nonexistent");
    expect(creds).toBeNull();
  });

  test("should list all users", async () => {
    const hash1 = await Bun.password.hash("secret123", { algorithm: "bcrypt", cost: 10 });
    const hash2 = await Bun.password.hash("secret456", { algorithm: "bcrypt", cost: 10 });
    await userRepository.create("alice", hash1);
    await userRepository.create("bob", hash2);

    const users = await userRepository.listUsers();
    expect(users.length).toBe(2);
    expect(users.map((u: any) => u.username).sort()).toEqual(["alice", "bob"]);
  });
});
