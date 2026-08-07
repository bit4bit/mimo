// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Integration tests for the managed repositories internal API.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { createInternalApiRouter } from "../index.js";
import { createMimoContext } from "../../../infrastructure/context/mimo-context.js";
import { createMockOS } from "../../../infrastructure/os/mock-adapter.js";
import type { MockOS } from "../../../infrastructure/os/mock-adapter.js";

describe("Repositories Internal API", () => {
  let app: Hono;
  let mimoContext: ReturnType<typeof createMimoContext>;
  let user1Token: string;
  let user2Token: string;

  beforeAll(async () => {
    const mockOS = createMockOS({
      env: {
        JWT_SECRET: "test-jwt-secret-for-repositories-api-tests",
        PORT: "3000",
        MIMO_HOME: "/tmp/test-mimo-repositories-api",
        MIMO_INTERNAL_VCS_PORT: "8000",
        MIMO_HOST: "localhost",
      },
      homeDir: "/home/test",
    }) as MockOS;

    mockOS.fs.seed({
      "/tmp/test-mimo-repositories-api": null,
      "/tmp/test-mimo-repositories-api/users": null,
      "/tmp/test-mimo-repositories-api/projects": null,
      "/tmp/test-mimo-repositories-api/agents": null,
      "/tmp/test-mimo-repositories-api/mcp-servers": null,
      "/tmp/test-mimo-repositories-api/session-repos": null,
    });

    mimoContext = createMimoContext({
      env: {
        JWT_SECRET: "test-jwt-secret-for-repositories-api-tests",
        PORT: 3000,
        PLATFORM_URL: "http://localhost:3000",
        MIMO_HOME: "/tmp/test-mimo-repositories-api",
        MIMO_VCS_REPOS_DIR: "/tmp/test-mimo-repositories-api/session-repos",
        MIMO_INTERNAL_VCS_PORT: 8000,
        MIMO_HOST: "localhost",
      },
      os: mockOS,
    });

    user1Token = await mimoContext.services.auth.generateToken("user1");
    user2Token = await mimoContext.services.auth.generateToken("user2");

    app = new Hono();
    app.route("/api/internal", createInternalApiRouter(mimoContext));
  });

  function authed(path: string, token: string, init: RequestInit = {}) {
    return new Request(`http://localhost:3000/api/internal${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
  }

  async function createRepository(
    token: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    return app.fetch(
      authed("/repositories", token, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  }

  describe("Authentication", () => {
    it("should require authentication for list", async () => {
      const res = await app.fetch(
        new Request("http://localhost:3000/api/internal/repositories"),
      );
      expect(res.status).toBe(401);
    });
  });

  describe("CRUD", () => {
    it("should create a repository", async () => {
      const res = await createRepository(user1Token, {
        name: "backend",
        repoUrl: "https://github.com/user/backend.git",
        repoType: "git",
      });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.repository.name).toBe("backend");
      expect(json.data.repository.repoUrl).toBe(
        "https://github.com/user/backend.git",
      );
      expect(json.data.repository.id).toBeDefined();
    });

    it("should reject missing fields", async () => {
      const res = await createRepository(user1Token, { name: "x" });
      expect(res.status).toBe(400);
    });

    it("should list repositories for the owner only", async () => {
      await createRepository(user2Token, {
        name: "user2-repo",
        repoUrl: "https://github.com/u2/repo.git",
        repoType: "git",
      });

      const res = await app.fetch(authed("/repositories", user2Token));
      const json = await res.json();
      expect(res.status).toBe(200);
      const names = json.data.repositories.map((r: any) => r.name);
      expect(names).toContain("user2-repo");
      expect(names).not.toContain("backend");
    });

    it("should get a repository by id", async () => {
      const created = await (
        await createRepository(user1Token, {
          name: "get-me",
          repoUrl: "https://github.com/user/get-me.git",
          repoType: "fossil",
          clonePort: 2222,
        })
      ).json();

      const res = await app.fetch(
        authed(`/repositories/${created.data.repository.id}`, user1Token),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.repository.repoType).toBe("fossil");
      expect(json.data.repository.clonePort).toBe(2222);
    });

    it("should not expose another user's repository", async () => {
      const created = await (
        await createRepository(user1Token, {
          name: "private-repo",
          repoUrl: "https://github.com/user/private.git",
          repoType: "git",
        })
      ).json();

      const res = await app.fetch(
        authed(`/repositories/${created.data.repository.id}`, user2Token),
      );
      expect(res.status).toBe(404);
    });

    it("should update a repository and clear credential", async () => {
      const created = await (
        await createRepository(user1Token, {
          name: "update-me",
          repoUrl: "https://github.com/user/update-me.git",
          repoType: "git",
        })
      ).json();
      const id = created.data.repository.id;

      const res = await app.fetch(
        authed(`/repositories/${id}`, user1Token, {
          method: "PUT",
          body: JSON.stringify({
            repoUrl: "https://github.com/user/updated.git",
            credentialId: null,
          }),
        }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.repository.repoUrl).toBe(
        "https://github.com/user/updated.git",
      );
      expect(json.data.repository.credentialId).toBeUndefined();
    });

    it("should reject duplicate names for the same owner", async () => {
      const res = await createRepository(user1Token, {
        name: "backend",
        repoUrl: "https://github.com/user/backend-dup.git",
        repoType: "git",
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/already exists/);
    });
  });

  describe("Credential validation", () => {
    it("should reject a credentialId that does not exist", async () => {
      const res = await createRepository(user1Token, {
        name: "bad-cred",
        repoUrl: "https://github.com/user/bad-cred.git",
        repoType: "git",
        credentialId: "nonexistent-cred",
      });
      expect(res.status).toBe(400);
    });

    it("should reject a credential owned by another user", async () => {
      const cred = await mimoContext.repos.credentials.create({
        name: "user2-cred",
        type: "https",
        username: "u2",
        password: "secret",
        owner: "user2",
      });

      const res = await createRepository(user1Token, {
        name: "stolen-cred",
        repoUrl: "https://github.com/user/stolen.git",
        repoType: "git",
        credentialId: cred.id,
      });
      expect(res.status).toBe(400);
    });

    it("should accept an owned credential", async () => {
      const cred = await mimoContext.repos.credentials.create({
        name: "user1-cred",
        type: "https",
        username: "u1",
        password: "secret",
        owner: "user1",
      });

      const res = await createRepository(user1Token, {
        name: "with-cred",
        repoUrl: "https://github.com/user/with-cred.git",
        repoType: "git",
        credentialId: cred.id,
      });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.repository.credentialId).toBe(cred.id);
    });

    it("should reject an https credential for an ssh URL", async () => {
      const cred = await mimoContext.repos.credentials.create({
        name: "user1-https-cred",
        type: "https",
        username: "u1",
        password: "secret",
        owner: "user1",
      });

      const res = await createRepository(user1Token, {
        name: "type-mismatch",
        repoUrl: "git@github.com:user/repo.git",
        repoType: "git",
        credentialId: cred.id,
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("SSH");
    });
  });

  describe("Delete protection and referencing projects", () => {
    it("should block deletion while a project references the repository", async () => {
      const created = await (
        await createRepository(user1Token, {
          name: "referenced-repo",
          repoUrl: "https://github.com/user/referenced.git",
          repoType: "git",
        })
      ).json();
      const repoId = created.data.repository.id;

      await mimoContext.repos.projects.create({
        name: "web-app",
        repoUrl: "https://github.com/user/referenced.git",
        repoType: "git",
        owner: "user1",
        repositories: [
          {
            id: "main",
            name: "referenced-repo",
            repoId,
            mountPath: ".",
            primary: true,
          } as any,
        ],
      });

      const res = await app.fetch(
        authed(`/repositories/${repoId}`, user1Token, { method: "DELETE" }),
      );
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toMatch(/web-app/);
    });

    it("should list referencing projects", async () => {
      const repos =
        await mimoContext.repos.managedRepositories.findByOwner("user1");
      const referenced = repos.find(
        (r: any) => r.name === "referenced-repo",
      ) as any;

      const res = await app.fetch(
        authed(
          `/repositories/${referenced.id}/referencing-projects`,
          user1Token,
        ),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.projects).toHaveLength(1);
      expect(json.data.projects[0].name).toBe("web-app");
    });

    it("should delete an unreferenced repository", async () => {
      const created = await (
        await createRepository(user1Token, {
          name: "orphan",
          repoUrl: "https://github.com/user/orphan.git",
          repoType: "git",
        })
      ).json();

      const res = await app.fetch(
        authed(`/repositories/${created.data.repository.id}`, user1Token, {
          method: "DELETE",
        }),
      );
      expect(res.status).toBe(200);
    });
  });
});
