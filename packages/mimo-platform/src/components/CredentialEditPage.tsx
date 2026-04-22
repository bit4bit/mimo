// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";
import type { Credential } from "../credentials/repository";

interface CredentialEditPageProps {
  credential: Credential;
  error?: string;
}

export const CredentialEditPage: FC<CredentialEditPageProps> = ({
  credential,
  error,
}) => {
  const isHttps = credential.type === "https";
  const cred = isHttps ? credential : null;
  const sshCred = !isHttps ? credential : null;

  return (
    <Layout title="Edit Credential">
      <div class="container">
        <h1>Edit Credential</h1>

        {error && <div class="error-message">{error}</div>}

        <form
          method="post"
          action={`/credentials/${credential.id}/edit`}
          class="credential-form"
        >
          <div class="form-group">
            <label htmlFor="type">Type</label>
            <input
              type="text"
              id="type"
              value={credential.type.toUpperCase()}
              disabled
              class="form-input disabled"
            />
            <p class="form-help">Credential type cannot be changed.</p>
          </div>

          <div class="form-group">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              name="name"
              defaultValue={credential.name}
              placeholder="e.g., GitHub Work"
              required
              class="form-input"
            />
          </div>

          {isHttps ? (
            <>
              <div class="form-group">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  defaultValue={cred?.username}
                  placeholder="e.g., developer"
                  class="form-input"
                />
              </div>

              <div class="form-group">
                <label htmlFor="password">Password / Token</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  placeholder="Leave blank to keep existing password"
                  class="form-input"
                />
                <p class="form-help">
                  Leave blank to keep the existing password. Enter a new value
                  to update it.
                </p>
              </div>
            </>
          ) : (
            <div class="form-group">
              <label htmlFor="privateKey">SSH Private Key</label>
              <textarea
                id="privateKey"
                name="privateKey"
                placeholder="Leave blank to keep existing key. Paste new key to update."
                rows={8}
                class="form-textarea"
              />
              <p class="form-help">
                Leave blank to keep the existing key. Paste a new key to update
                it. Supported formats: OpenSSH, RSA, ECDSA, Ed25519.
              </p>
            </div>
          )}

          <div class="form-actions">
            <button type="submit" class="btn">
              Update Credential
            </button>
            <a href="/credentials" class="btn-secondary">
              Cancel
            </a>
          </div>
        </form>
      </div>
    </Layout>
  );
};
