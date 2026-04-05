import { Hono } from "hono";
import { credentialRepository, Credential } from "../credentials/repository";
import { authMiddleware } from "../auth/middleware";
import { CredentialsListPage } from "../components/CredentialsListPage";
import { CredentialCreatePage } from "../components/CredentialCreatePage";
import { CredentialEditPage } from "../components/CredentialEditPage";

const credentials = new Hono();

// List all credentials (GET /credentials)
credentials.get("/", authMiddleware, async (c) => {
  const user = c.get("user") as { username: string };
  const credentialsList = await credentialRepository.findByOwner(user.username);
  return c.html(<CredentialsListPage credentials={credentialsList} />);
});

// Show create form (GET /credentials/new)
credentials.get("/new", authMiddleware, (c) => {
  return c.html(<CredentialCreatePage />);
});

// Create credential (POST /credentials)
credentials.post("/", authMiddleware, async (c) => {
  const body = await c.req.parseBody();
  const name = body.name as string;
  const type = (body.type as string) || "https";
  const user = c.get("user") as { username: string };

  if (!name) {
    return c.html(<CredentialCreatePage error="Credential name is required" />, 400);
  }

  if (type !== "https" && type !== "ssh") {
    return c.html(<CredentialCreatePage error="Invalid credential type" />, 400);
  }

  try {
    if (type === "https") {
      const username = body.username as string;
      const password = body.password as string;

      if (!username || !password) {
        return c.html(<CredentialCreatePage error="Username and password are required for HTTPS credentials" />, 400);
      }

      await credentialRepository.create({
        name,
        type: "https",
        username,
        password,
        owner: user.username,
      });
    } else {
      // SSH credential
      const privateKey = body.privateKey as string;

      if (!privateKey) {
        return c.html(<CredentialCreatePage error="Private key is required for SSH credentials" />, 400);
      }

      await credentialRepository.create({
        name,
        type: "ssh",
        privateKey,
        owner: user.username,
      });
    }

    return c.redirect("/credentials", 302);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to create credential";
    return c.html(<CredentialCreatePage error={errorMessage} />, 400);
  }
});

// Edit form (GET /credentials/:id/edit)
credentials.get("/:id/edit", authMiddleware, async (c) => {
  const id = c.req.param("id");
  const user = c.get("user") as { username: string };
  
  const credential = await credentialRepository.findById(id, user.username);
  if (!credential) {
    return c.notFound();
  }

  return c.html(<CredentialEditPage credential={credential} />);
});

// Update credential (POST /credentials/:id/edit)
credentials.post("/:id/edit", authMiddleware, async (c) => {
  const id = c.req.param("id");
  const user = c.get("user") as { username: string };
  
  const credential = await credentialRepository.findById(id, user.username);
  if (!credential) {
    return c.notFound();
  }

  const body = await c.req.parseBody();
  const name = body.name as string;

  if (!name) {
    return c.html(<CredentialEditPage credential={credential} error="Credential name is required" />, 400);
  }

  try {
    const updates: { name: string; type: "https" | "ssh"; username?: string; password?: string; privateKey?: string } = {
      name,
      type: credential.type,
    };

    if (credential.type === "https") {
      const username = body.username as string;
      const password = body.password as string;
      
      if (username) updates.username = username;
      if (password) updates.password = password;
    } else {
      // SSH credential
      const privateKey = body.privateKey as string;
      
      if (privateKey) updates.privateKey = privateKey;
    }

    await credentialRepository.update(id, user.username, updates);
    return c.redirect("/credentials", 302);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to update credential";
    return c.html(<CredentialEditPage credential={credential} error={errorMessage} />, 400);
  }
});

// Delete credential (POST /credentials/:id/delete)
credentials.post("/:id/delete", authMiddleware, async (c) => {
  const id = c.req.param("id");
  const user = c.get("user") as { username: string };
  
  const credential = await credentialRepository.findById(id, user.username);
  if (!credential) {
    return c.notFound();
  }

  await credentialRepository.delete(id, user.username);
  return c.redirect("/credentials", 302);
});

export default credentials;
