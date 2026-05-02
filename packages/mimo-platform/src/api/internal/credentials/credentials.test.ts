/**
 * Integration tests for the credentials internal API.
 *
 * These tests verify that the credentials internal API endpoints:
 * - Require authentication
 * - Return standardized JSON responses
 * - Perform CRUD operations correctly
 * - Enforce ownership and authorization
 * - Do not expose secrets in list endpoint
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { createInternalApiRouter } from "../index.js";
import { createMimoContext } from "../../../context/mimo-context.js";
import { createMockOS } from "../../../os/mock-adapter.js";
import type { MockOS } from "../../../os/mock-adapter.js";

describe("Credentials Internal API", () => {
  let app: Hono;
  let mimoContext: ReturnType<typeof createMimoContext>;
  let mockOS: MockOS;
  let validToken: string;
  let user1Token: string;
  let user2Token: string;

  beforeAll(async () => {
    // Set up mock OS with test environment
    mockOS = createMockOS({
      env: {
        JWT_SECRET: "test-jwt-secret-for-credentials-api-tests",
        PORT: "3000",
        MIMO_HOME: "/tmp/test-mimo-credentials",
        MIMO_SHARED_FOSSIL_SERVER_PORT: "8000",
        MIMO_HOST: "localhost",
      },
      homeDir: "/home/test",
    }) as MockOS;

    // Create mock filesystem structure
    mockOS.fs.seed({
      "/tmp/test-mimo-credentials": null,
      "/tmp/test-mimo-credentials/users": null,
      "/tmp/test-mimo-credentials/projects": null,
      "/tmp/test-mimo-credentials/agents": null,
      "/tmp/test-mimo-credentials/mcp-servers": null,
      "/tmp/test-mimo-credentials/session-fossils": null,
    });

    // Create MimoContext with mock OS
    mimoContext = createMimoContext({
      env: {
        JWT_SECRET: "test-jwt-secret-for-credentials-api-tests",
        PORT: 3000,
        PLATFORM_URL: "http://localhost:3000",
        MIMO_HOME: "/tmp/test-mimo-credentials",
        FOSSIL_REPOS_DIR: "/tmp/test-mimo-credentials/session-fossils",
        MIMO_SHARED_FOSSIL_SERVER_PORT: 8000,
        MIMO_HOST: "localhost",
      },
      os: mockOS,
    });

    // Generate tokens for testing
    user1Token = await mimoContext.services.auth.generateToken("user1");
    user2Token = await mimoContext.services.auth.generateToken("user2");
    validToken = user1Token;

    // Create app with internal API router mounted
    app = new Hono();
    app.route("/api/internal", createInternalApiRouter(mimoContext));
  });

  describe("List Credentials", () => {
    it("should require authentication", async () => {
      const req = new Request("http://localhost:3000/api/internal/credentials");
      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Missing Authorization header");
    });

    it("should return empty list when no credentials exist", async () => {
      const req = new Request("http://localhost:3000/api/internal/credentials", {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.credentials).toEqual([]);
    });

    it("should return only credentials owned by the user (without secrets)", async () => {
      // Create HTTPS credential for user1
      const createRes = await app.fetch(
        new Request("http://localhost:3000/api/internal/credentials", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Test HTTPS",
            type: "https",
            username: "testuser",
            password: "secretpassword123",
          }),
        }),
      );
      expect(createRes.status).toBe(201);

      // Try to access as user2
      const listRes = await app.fetch(
        new Request("http://localhost:3000/api/internal/credentials", {
          headers: {
            Authorization: `Bearer ${user2Token}`,
          },
        }),
      );
      const json = await listRes.json();

      expect(listRes.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.credentials).toHaveLength(0);
    });

    it("should return HTTPS credentials with username but not password", async () => {
      const createRes = await app.fetch(
        new Request("http://localhost:3000/api/internal/credentials", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "HTTPS Credential For List",
            type: "https",
            username: "myuser",
            password: "secretpass",
          }),
        }),
      );
      const createJson = await createRes.json();
      const credentialId = createJson.data.credential.id;

      // List credentials
      const listRes = await app.fetch(
        new Request("http://localhost:3000/api/internal/credentials", {
          headers: {
            Authorization: `Bearer ${user1Token}`,
          },
        }),
      );
      const listJson = await listRes.json();

      expect(listRes.status).toBe(200);
      expect(listJson.success).toBe(true);
      
      // Find the credential in the list
      const credential = listJson.data.credentials.find(
        (c: { id: string }) => c.id === credentialId,
      );
      expect(credential).toBeDefined();
      expect(credential.name).toBe("HTTPS Credential For List");
      expect(credential.type).toBe("https");
      expect(credential.username).toBe("myuser");
      expect(credential.password).toBeUndefined();
    });
  });

  describe("Get Credential", () => {
    it("should require authentication", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/credentials/123",
      );
      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
    });

    it("should return 404 for non-existent credential", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/credentials/nonexistent",
        {
          headers: {
            Authorization: `Bearer ${user1Token}`,
          },
        },
      );
      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Credential not found");
    });

    it("should return credential with secrets when authenticated", async () => {
      // Create SSH credential
      const createRes = await app.fetch(
        new Request("http://localhost:3000/api/internal/credentials", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "SSH Credential",
            type: "ssh",
            privateKey: `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACB4HrBdrkD3gH0C6dK+YdP2Xy4K8vY0cWqZrFg3kH8AAAED4HrBdrkD3gH0
C6dK+YdP2Xy4K8vY0cWqZrFg3kH8AAAAFGZvcmNlLWF0LWxhU3QtdGVzdC1rZXk=
-----END OPENSSH PRIVATE KEY-----`,
          }),
        }),
      );
      const createJson = await createRes.json();
      const credentialId = createJson.data.credential.id;

      // Get credential
      const getRes = await app.fetch(
        new Request(
          `http://localhost:3000/api/internal/credentials/${credentialId}`,
          {
            headers: {
              Authorization: `Bearer ${user1Token}`,
            },
          },
        ),
      );
      const getJson = await getRes.json();

      expect(getRes.status).toBe(200);
      expect(getJson.success).toBe(true);
      expect(getJson.data.credential.id).toBe(credentialId);
      expect(getJson.data.credential.name).toBe("SSH Credential");
      expect(getJson.data.credential.type).toBe("ssh");
      expect(getJson.data.credential.privateKey).toBeDefined();
    });
  });

  describe("Create HTTPS Credential", () => {
    it("should require authentication", async () => {
      const req = new Request("http://localhost:3000/api/internal/credentials", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test",
          type: "https",
          username: "user",
          password: "pass",
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
    });

    it("should create HTTPS credential with valid data", async () => {
      const req = new Request("http://localhost:3000/api/internal/credentials", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user1Token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "My HTTPS Credential",
          type: "https",
          username: "githubuser",
          password: "githubtoken123",
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.credential.name).toBe("My HTTPS Credential");
      expect(json.data.credential.type).toBe("https");
      expect(json.data.credential.username).toBe("githubuser");
      expect(json.data.credential.password).toBe("githubtoken123");
    });

    it("should return 400 when name is missing", async () => {
      const req = new Request("http://localhost:3000/api/internal/credentials", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user1Token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "https",
          username: "user",
          password: "pass",
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Credential name is required");
    });

    it("should return 400 when username is missing for HTTPS", async () => {
      const req = new Request("http://localhost:3000/api/internal/credentials", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user1Token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test",
          type: "https",
          password: "pass",
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Username and password are required for HTTPS credentials");
    });

    it("should return 400 when password is missing for HTTPS", async () => {
      const req = new Request("http://localhost:3000/api/internal/credentials", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user1Token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test",
          type: "https",
          username: "user",
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Username and password are required for HTTPS credentials");
    });
  });

  describe("Create SSH Credential", () => {
    it("should create SSH credential with valid data", async () => {
      const validKey = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACB4HrBdrkD3gH0C6dK+YdP2Xy4K8vY0cWqZrFg3kH8AAAED4HrBdrkD3gH0
C6dK+YdP2Xy4K8vY0cWqZrFg3kH8AAAAFGZvcmNlLWF0LWxhU3QtdGVzdC1rZXk=
-----END OPENSSH PRIVATE KEY-----`;

      const req = new Request("http://localhost:3000/api/internal/credentials", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user1Token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "My SSH Key",
          type: "ssh",
          privateKey: validKey,
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.credential.name).toBe("My SSH Key");
      expect(json.data.credential.type).toBe("ssh");
      expect(json.data.credential.privateKey).toBe(validKey);
    });

    it("should return 400 when private key is missing for SSH", async () => {
      const req = new Request("http://localhost:3000/api/internal/credentials", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user1Token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test",
          type: "ssh",
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Private key is required for SSH credentials");
    });

    it("should return 400 for invalid SSH key format", async () => {
      const req = new Request("http://localhost:3000/api/internal/credentials", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user1Token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test",
          type: "ssh",
          privateKey: "invalid-key-format",
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Invalid SSH private key format");
    });
  });

  describe("Update Credential", () => {
    let httpsCredentialId: string;
    let sshCredentialId: string;

    beforeAll(async () => {
      // Create HTTPS credential
      const httpsRes = await app.fetch(
        new Request("http://localhost:3000/api/internal/credentials", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "HTTPS To Update",
            type: "https",
            username: "original",
            password: "originalpass",
          }),
        }),
      );
      const httpsJson = await httpsRes.json();
      httpsCredentialId = httpsJson.data.credential.id;

      // Create SSH credential
      const sshRes = await app.fetch(
        new Request("http://localhost:3000/api/internal/credentials", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "SSH To Update",
            type: "ssh",
            privateKey: `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACB4HrBdrkD3gH0C6dK+YdP2Xy4K8vY0cWqZrFg3kH8AAAED4HrBdrkD3gH0
C6dK+YdP2Xy4K8vY0cWqZrFg3kH8AAAAFGZvcmNlLWF0LWxhU3QtdGVzdC1rZXk=
-----END OPENSSH PRIVATE KEY-----`,
          }),
        }),
      );
      const sshJson = await sshRes.json();
      sshCredentialId = sshJson.data.credential.id;
    });

    it("should require authentication", async () => {
      const req = new Request(
        `http://localhost:3000/api/internal/credentials/${httpsCredentialId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Updated" }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
    });

    it("should return 404 for non-existent credential", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/credentials/nonexistent",
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Updated" }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it("should update HTTPS credential name", async () => {
      const req = new Request(
        `http://localhost:3000/api/internal/credentials/${httpsCredentialId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Updated HTTPS Name" }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.credential.name).toBe("Updated HTTPS Name");
      expect(json.data.credential.username).toBe("original");
      expect(json.data.credential.password).toBe("originalpass");
    });

    it("should update HTTPS credential username and password", async () => {
      const req = new Request(
        `http://localhost:3000/api/internal/credentials/${httpsCredentialId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: "newuser",
            password: "newpass",
          }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.credential.username).toBe("newuser");
      expect(json.data.credential.password).toBe("newpass");
    });

    it("should update SSH credential name", async () => {
      const req = new Request(
        `http://localhost:3000/api/internal/credentials/${sshCredentialId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Updated SSH Name" }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.credential.name).toBe("Updated SSH Name");
    });

    it("should update SSH credential private key", async () => {
      const newKey = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACB4HrBdrkD3gH0C6dK+YdP2Xy4K8vY0cWqZrFg3kH8AAAED4HrBdrkD3gH0
C6dK+YdP2Xy4K8vY0cWqZrFg3kH8AAAFGZvcmNlLWF0LWxhU3QtdGVzdC1rZXk=
-----END OPENSSH PRIVATE KEY-----`;

      const req = new Request(
        `http://localhost:3000/api/internal/credentials/${sshCredentialId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ privateKey: newKey }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.credential.privateKey).toBe(newKey);
    });
  });

  describe("Delete Credential", () => {
    it("should require authentication", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/credentials/some-id",
        {
          method: "DELETE",
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
    });

    it("should return 404 for non-existent credential", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/credentials/nonexistent",
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${user1Token}`,
          },
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Credential not found");
    });

    it("should delete credential when authenticated", async () => {
      // Create a credential to delete
      const createRes = await app.fetch(
        new Request("http://localhost:3000/api/internal/credentials", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "To Delete",
            type: "https",
            username: "user",
            password: "pass",
          }),
        }),
      );
      const createJson = await createRes.json();
      const credentialId = createJson.data.credential.id;

      // Delete it
      const deleteRes = await app.fetch(
        new Request(
          `http://localhost:3000/api/internal/credentials/${credentialId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${user1Token}`,
            },
          },
        ),
      );
      const deleteJson = await deleteRes.json();

      expect(deleteRes.status).toBe(200);
      expect(deleteJson.success).toBe(true);
      expect(deleteJson.data.success).toBe(true);

      // Verify it's gone
      const getRes = await app.fetch(
        new Request(
          `http://localhost:3000/api/internal/credentials/${credentialId}`,
          {
            headers: {
              Authorization: `Bearer ${user1Token}`,
            },
          },
        ),
      );
      expect(getRes.status).toBe(404);
    });
  });

  describe("Secrets Not Exposed in List", () => {
    it("should not expose password in list endpoint", async () => {
      // Create HTTPS credential
      const createRes = await app.fetch(
        new Request("http://localhost:3000/api/internal/credentials", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Secret HTTPS",
            type: "https",
            username: "user",
            password: "super-secret-password-123",
          }),
        }),
      );
      expect(createRes.status).toBe(201);

      // List credentials
      const listRes = await app.fetch(
        new Request("http://localhost:3000/api/internal/credentials", {
          headers: {
            Authorization: `Bearer ${user1Token}`,
          },
        }),
      );
      const listJson = await listRes.json();

      expect(listRes.status).toBe(200);
      expect(listJson.success).toBe(true);
      
      // Find the credential in the list
      const credential = listJson.data.credentials.find(
        (c: { name: string }) => c.name === "Secret HTTPS",
      );
      expect(credential).toBeDefined();
      expect(credential.username).toBe("user");
      expect(credential.password).toBeUndefined();
    });

    it("should not expose privateKey in list endpoint", async () => {
      // Create SSH credential
      const createRes = await app.fetch(
        new Request("http://localhost:3000/api/internal/credentials", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Secret SSH",
            type: "ssh",
            privateKey: `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACB4HrBdrkD3gH0C6dK+YdP2Xy4K8vY0cWqZrFg3kH8AAAED4HrBdrkD3gH0
C6dK+YdP2Xy4K8vY0cWqZrFg3kH8AAAAFGZvcmNlLWF0LWxhU3QtdGVzdC1rZXk=
-----END OPENSSH PRIVATE KEY-----`,
          }),
        }),
      );
      expect(createRes.status).toBe(201);

      // List credentials
      const listRes = await app.fetch(
        new Request("http://localhost:3000/api/internal/credentials", {
          headers: {
            Authorization: `Bearer ${user1Token}`,
          },
        }),
      );
      const listJson = await listRes.json();

      expect(listRes.status).toBe(200);
      expect(listJson.success).toBe(true);
      
      // Find the credential in the list
      const credential = listJson.data.credentials.find(
        (c: { name: string }) => c.name === "Secret SSH",
      );
      expect(credential).toBeDefined();
      expect(credential.privateKey).toBeUndefined();
    });
  });

  describe("Ownership Enforcement", () => {
    it("should not allow user1 to access user2's credential", async () => {
      // Create credential as user1
      const createRes = await app.fetch(
        new Request("http://localhost:3000/api/internal/credentials", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "User1 Credential",
            type: "https",
            username: "user1",
            password: "pass",
          }),
        }),
      );
      const createJson = await createRes.json();
      const credentialId = createJson.data.credential.id;

      // Try to get as user2
      const getRes = await app.fetch(
        new Request(
          `http://localhost:3000/api/internal/credentials/${credentialId}`,
          {
            headers: {
              Authorization: `Bearer ${user2Token}`,
            },
          },
        ),
      );
      expect(getRes.status).toBe(404);

      // Try to update as user2
      const updateRes = await app.fetch(
        new Request(
          `http://localhost:3000/api/internal/credentials/${credentialId}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${user2Token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: "Hacked" }),
          },
        ),
      );
      expect(updateRes.status).toBe(404);

      // Try to delete as user2
      const deleteRes = await app.fetch(
        new Request(
          `http://localhost:3000/api/internal/credentials/${credentialId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${user2Token}`,
            },
          },
        ),
      );
      expect(deleteRes.status).toBe(404);
    });
  });
});
