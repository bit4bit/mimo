import type { FC } from "hono/jsx";

interface CredentialCreatePageProps {
  error?: string;
}

export const CredentialCreatePage: FC<CredentialCreatePageProps> = ({ error }) => {
  return (
    <div class="credential-create">
      <h1>New Credential</h1>
      
      {error && (
        <div class="error-message">{error}</div>
      )}
      
      <form method="POST" action="/credentials" class="credential-form">
        <div class="form-group">
          <label htmlFor="type">Type</label>
          <select id="type" name="type" required class="form-select">
            <option value="">Select credential type...</option>
            <option value="https">HTTPS (Username + Password/Token)</option>
            <option value="ssh">SSH (Private Key)</option>
          </select>
        </div>
        
        <div class="form-group">
          <label htmlFor="name">Name</label>
          <input
            type="text"
            id="name"
            name="name"
            placeholder="e.g., GitHub Work"
            required
            class="form-input"
          />
        </div>
        
        <div id="https-fields">
          <div class="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
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
              placeholder="Enter password or personal access token"
              class="form-input"
            />
            <p class="form-help">
              Use a personal access token for better security.
            </p>
          </div>
        </div>
        
        <div id="ssh-fields" style="display: none;">
          <div class="form-group">
            <label htmlFor="privateKey">SSH Private Key</label>
            <textarea
              id="privateKey"
              name="privateKey"
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
              rows={8}
              class="form-textarea"
            />
            <p class="form-help">
              Paste your SSH private key. Supported formats: OpenSSH, RSA, ECDSA, Ed25519.
            </p>
          </div>
        </div>
        
        <div class="form-actions">
          <button type="submit" class="btn">Create Credential</button>
          <a href="/credentials" class="btn-secondary">Cancel</a>
        </div>
      </form>
      
      <script dangerouslySetInnerHTML={{
        __html: `
          document.getElementById('type').addEventListener('change', function() {
            const type = this.value;
            const httpsFields = document.getElementById('https-fields');
            const sshFields = document.getElementById('ssh-fields');
            
            if (type === 'https') {
              httpsFields.style.display = 'block';
              sshFields.style.display = 'none';
              httpsFields.querySelectorAll('input').forEach(input => input.required = true);
              sshFields.querySelectorAll('textarea').forEach(input => input.required = false);
            } else if (type === 'ssh') {
              httpsFields.style.display = 'none';
              sshFields.style.display = 'block';
              httpsFields.querySelectorAll('input').forEach(input => input.required = false);
              sshFields.querySelectorAll('textarea').forEach(input => input.required = true);
            } else {
              httpsFields.style.display = 'none';
              sshFields.style.display = 'none';
              httpsFields.querySelectorAll('input').forEach(input => input.required = false);
              sshFields.querySelectorAll('textarea').forEach(input => input.required = false);
            }
          });
        `
      }} />
    </div>
  );
};
