import type { FC } from "hono/jsx";
import type { Credential } from "../credentials/repository";

interface CredentialsListPageProps {
  credentials: Credential[];
}

export const CredentialsListPage: FC<CredentialsListPageProps> = ({ credentials }) => {
  return (
    <div class="credentials-list">
      <div class="credentials-header">
        <h1>Credentials</h1>
        <a href="/credentials/new" class="btn">New Credential</a>
      </div>
      
      {credentials.length === 0 ? (
        <div class="empty-state">
          <p>No credentials configured yet.</p>
          <p>Create credentials to authenticate with private repositories.</p>
        </div>
      ) : (
        <div class="credentials-grid">
          {credentials.map((cred) => (
            <div key={cred.id} class="credential-card">
              <div class="credential-header">
                <div class="credential-name">{cred.name}</div>
                <div class={`credential-type type-${cred.type}`}>
                  {cred.type.toUpperCase()}
                </div>
              </div>
              
              <div class="credential-details">
                {cred.type === "https" ? (
                  <>
                    <div class="credential-field">
                      <span class="field-label">Username:</span>
                      <span class="field-value">{cred.username}</span>
                    </div>
                    <div class="credential-field">
                      <span class="field-label">Password:</span>
                      <span class="field-value masked">********</span>
                    </div>
                  </>
                ) : (
                  <div class="credential-field">
                    <span class="field-label">SSH Key:</span>
                    <span class="field-value masked">********</span>
                  </div>
                )}
              </div>
              
              <div class="credential-actions">
                <a href={`/credentials/${cred.id}/edit`} class="btn-secondary">Edit</a>
                <form method="POST" action={`/credentials/${cred.id}/delete`} style="display: inline;">
                  <button type="submit" class="btn-danger">Delete</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
