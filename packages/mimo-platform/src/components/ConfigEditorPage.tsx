/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Layout } from "./Layout.js";
import type { FC } from "hono/jsx";
import type { Config, ValidationError } from "../config/service.js";

interface ConfigEditorProps {
  config: Config;
  errors?: ValidationError[];
  success?: boolean;
}

export const ConfigEditorPage: FC<ConfigEditorProps> = ({ config, errors = [], success }) => {
  return (
    <Layout title="Configuration Editor">
      <div class="config-editor-container">
        <div class="config-header">
          <h1>Configuration</h1>
          <a href="/" class="btn-secondary">← Back to Projects</a>
        </div>

        {success && (
          <div class="alert alert-success">Configuration saved successfully!</div>
        )}

        {errors.length > 0 && (
          <div class="alert alert-error">
            <strong>Validation Errors:</strong>
            <ul>
              {errors.map((error, i) => (
                <li key={i}>{error.field}: {error.message}</li>
              ))}
            </ul>
          </div>
        )}

        <form method="POST" action="/config" class="config-form">
          {/* Appearance Section */}
          <div class="config-section">
            <h2>Appearance</h2>
            
            <div class="form-group">
              <label>Theme</label>
              <select name="theme" value={config.theme}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>

            <div class="form-group">
              <label>Font Size</label>
              <input
                type="number"
                name="fontSize"
                min="8"
                max="32"
                value={config.fontSize}
              />
            </div>

            <div class="form-group">
              <label>Font Family</label>
              <input
                type="text"
                name="fontFamily"
                value={config.fontFamily}
                placeholder="monospace"
              />
            </div>
          </div>

          {/* Keybindings Section */}
          <div class="config-section">
            <h2>Keybindings</h2>
            <p class="help-text">
              Format: C- for Ctrl, M- for Alt/Meta, S- for Shift. 
              Examples: "C-x c", "C-c C-c", "M-x"
            </p>

            <div class="keybindings-grid">
              <div class="form-group">
                <label>Cancel Request</label>
                <input
                  type="text"
                  name="keybindings.cancel_request"
                  value={config.keybindings.cancel_request}
                />
              </div>

              <div class="form-group">
                <label>Commit & Push</label>
                <input
                  type="text"
                  name="keybindings.commit"
                  value={config.keybindings.commit}
                />
              </div>

              <div class="form-group">
                <label>Find File</label>
                <input
                  type="text"
                  name="keybindings.find_file"
                  value={config.keybindings.find_file}
                />
              </div>

              <div class="form-group">
                <label>Switch Project</label>
                <input
                  type="text"
                  name="keybindings.switch_project"
                  value={config.keybindings.switch_project}
                />
              </div>

              <div class="form-group">
                <label>Switch Session</label>
                <input
                  type="text"
                  name="keybindings.switch_session"
                  value={config.keybindings.switch_session}
                />
              </div>

              <div class="form-group">
                <label>Focus Left Buffer</label>
                <input
                  type="text"
                  name="keybindings.focus_left"
                  value={config.keybindings.focus_left}
                />
              </div>

              <div class="form-group">
                <label>Focus Center Buffer</label>
                <input
                  type="text"
                  name="keybindings.focus_center"
                  value={config.keybindings.focus_center}
                />
              </div>

              <div class="form-group">
                <label>Focus Right Buffer</label>
                <input
                  type="text"
                  name="keybindings.focus_right"
                  value={config.keybindings.focus_right}
                />
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button type="reset" class="btn-secondary">Reset to Defaults</button>
            <button type="submit" class="btn-primary">Save Configuration</button>
          </div>
        </form>

        <style>{`
          .config-editor-container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          .config-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 15px;
            border-bottom: 1px solid #444;
          }
          .config-header h1 {
            margin: 0;
          }
          .config-section {
            background: #2d2d2d;
            border: 1px solid #444;
            padding: 20px;
            margin-bottom: 20px;
          }
          .config-section h2 {
            margin: 0 0 20px 0;
            font-size: 16px;
            color: #74c0fc;
          }
          .help-text {
            color: #888;
            font-size: 12px;
            margin-bottom: 15px;
          }
          .keybindings-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 15px;
          }
          .form-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #444;
          }
          .btn-primary {
            background: #74c0fc;
            border: none;
            color: #1a1a1a;
            padding: 10px 20px;
            cursor: pointer;
            font-family: monospace;
            font-weight: bold;
          }
          .btn-primary:hover {
            background: #89c9fc;
          }
          .btn-secondary {
            background: #2d2d2d;
            border: 1px solid #444;
            color: #888;
            padding: 10px 20px;
            cursor: pointer;
            font-family: monospace;
            text-decoration: none;
          }
          .btn-secondary:hover {
            background: #333;
          }
          .alert {
            padding: 15px;
            margin-bottom: 20px;
            border: 1px solid;
          }
          .alert-success {
            background: #0b3d0b;
            border-color: #51cf66;
            color: #51cf66;
          }
          .alert-error {
            background: #3d0b0b;
            border-color: #ff6b6b;
            color: #ff6b6b;
          }
          .alert ul {
            margin: 10px 0 0 20px;
          }
          select, input {
            width: 100%;
            background: #1a1a1a;
            border: 1px solid #555;
            color: #d4d4d4;
            padding: 8px;
            font-family: monospace;
          }
          input:focus, select:focus {
            outline: none;
            border-color: #74c0fc;
          }
          label {
            display: block;
            margin-bottom: 5px;
            color: #888;
            font-size: 12px;
            text-transform: uppercase;
          }
          .form-group {
            margin-bottom: 15px;
          }
        `}</style>
      </div>
    </Layout>
  );
};
