import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";

interface LoginProps {
  error?: string;
}

export const LoginPage: FC<LoginProps> = ({ error }) => {
  return (
    <Layout title="Login">
      <div class="container">
        <h1>MIMO Login</h1>
        <form method="POST" action="/auth/login">
          <label>Username</label>
          <input type="text" name="username" required  data-help-id="login-page-username-input" />

          <label>Password</label>
          <input type="password" name="password" required  data-help-id="login-page-password-input" />

          <button type="submit" data-help-id="login-page-button">Login</button>

          {error && <div class="error">{error}</div>}
        </form>
        <div class="link">
          Don't have an account? <a href="/auth/register" data-help-id="login-page-a">Register</a>
        </div>
      </div>
    </Layout>
  );
};
