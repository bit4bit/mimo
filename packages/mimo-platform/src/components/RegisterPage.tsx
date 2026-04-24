import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";

interface RegisterProps {
  error?: string;
  success?: string;
}

export const RegisterPage: FC<RegisterProps> = ({ error, success }) => {
  return (
    <Layout title="Register">
      <div class="container">
        <h1>MIMO Register</h1>
        <form method="POST" action="/auth/register">
          <label>Username</label>
          <input type="text" name="username" required  data-help-id="register-page-username-input" />

          <label>Password</label>
          <input type="password" name="password" required minLength="6"  data-help-id="register-page-password-input" />

          <button type="submit" data-help-id="register-page-button">Register</button>

          {error && <div class="error">{error}</div>}
          {success && <div class="success">{success}</div>}
        </form>
        <div class="link">
          Already have an account? <a href="/auth/login" data-help-id="register-page-a">Login</a>
        </div>
      </div>
    </Layout>
  );
};
