import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SessionRepository } from "../src/sessions/repository.js";
import { existsSync, rmdirSync, unlinkSync, readdirSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtempSync } from "fs";
import { dump, load } from "js-yaml";

// Use a temp directory for each test
let testBasePath: string;

describe("Session Creation with MCP Servers", () => {
  let sessionRepository: SessionRepository;

  beforeEach(() => {
    // Create a temp directory for each test
    testBasePath = mkdtempSync(join(tmpdir(), "mimo-session-mcp-test-"));
    
    // Set MIMO_HOME environment variable
    process.env.MIMO_HOME = testBasePath;
    
    // Create required directories
    mkdirSync(join(testBasePath, "projects"), { recursive: true });
    
    sessionRepository = new SessionRepository();
  });

  afterEach(() => {
    // Clean up
    delete process.env.MIMO_HOME;
    try {
      if (existsSync(testBasePath)) {
        const { rmSync } = require("fs");
        rmSync(testBasePath, { recursive: true, force: true });
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe("Session with MCP servers", () => {
    it("should create session with mcpServerIds", async () => {
      const session = await sessionRepository.create({
        name: "Test Session",
        projectId: "test-project",
        owner: "testuser",
        mcpServerIds: ["filesystem", "github"],
      });

      expect(session.mcpServerIds).toEqual(["filesystem", "github"]);
    });

    it("should default to empty mcpServerIds when not provided", async () => {
      const session = await sessionRepository.create({
        name: "Test Session",
        projectId: "test-project",
        owner: "testuser",
      });

      expect(session.mcpServerIds).toEqual([]);
    });

    it("should persist mcpServerIds in session.yaml", async () => {
      const session = await sessionRepository.create({
        name: "Test Session",
        projectId: "test-project",
        owner: "testuser",
        mcpServerIds: ["postgres", "redis"],
      });

      // Read back from repository
      const foundSession = await sessionRepository.findById(session.id);
      expect(foundSession?.mcpServerIds).toEqual(["postgres", "redis"]);
    });

    it("should update mcpServerIds when updating session", async () => {
      const session = await sessionRepository.create({
        name: "Test Session",
        projectId: "test-project",
        owner: "testuser",
        mcpServerIds: ["filesystem"],
      });

      await sessionRepository.update(session.id, {
        mcpServerIds: ["filesystem", "github", "postgres"],
      });

      const updatedSession = await sessionRepository.findById(session.id);
      expect(updatedSession?.mcpServerIds).toEqual(["filesystem", "github", "postgres"]);
    });
  });

  describe("Backward compatibility", () => {
    it("should handle sessions without mcpServerIds field", async () => {
      // Create a session
      const session = await sessionRepository.create({
        name: "Old Session",
        projectId: "test-project",
        owner: "testuser",
      });

      // Simulate old session without mcpServerIds by manually editing the file
      const sessionPath = join(
        testBasePath,
        "projects",
        "test-project",
        "sessions",
        session.id,
        "session.yaml"
      );
      
      // Read current content
      const content = readFileSync(sessionPath, "utf-8");
      const data = load(content) as any;
      
      // Remove mcpServerIds to simulate old session
      delete data.mcpServerIds;
      writeFileSync(sessionPath, dump(data), "utf-8");

      // Should still be readable with default empty array
      const foundSession = await sessionRepository.findById(session.id);
      expect(foundSession?.mcpServerIds).toEqual([]);
    });
  });
});
