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
          <input type="text" name="username" required />

          <label>Password</label>
          <input type="password" name="password" required minLength="6" />

          <button type="submit">Register</button>

          {error && <div class="error">{error}</div>}
          {success && <div class="success">{success}</div>}
        </form>
        <div class="link">
          Already have an account? <a href="/auth/login">Login</a>
        </div>
      </div>
    </Layout>
  );
};
