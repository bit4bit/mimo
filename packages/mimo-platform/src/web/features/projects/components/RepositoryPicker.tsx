// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";

export interface PickerRepository {
  id: string;
  name: string;
  repoUrl: string;
  repoType: "git" | "fossil";
}

export interface PickerExistingEntry {
  repoId?: string;
  mountPath?: string;
  sourceBranch?: string;
  newBranch?: string;
}

interface RepositoryPickerProps {
  repositories: PickerRepository[];
  existing?: PickerExistingEntry[];
}

export const RepositoryPicker: FC<RepositoryPickerProps> = ({
  repositories,
  existing = [],
}) => {
  if (repositories.length === 0) {
    return (
      <div class="form-group repository-picker-empty">
        <label>Repositories</label>
        <p>
          You don't have any managed repositories yet.{" "}
          <a href="/repositories/new">Create a repository first</a>, then pick
          it here.
        </p>
      </div>
    );
  }

  const existingByRepoId = new Map(
    existing
      .filter((entry) => entry.repoId)
      .map((entry) => [entry.repoId as string, entry]),
  );

  return (
    <div class="form-group repository-picker">
      <label>Repositories</label>
      <small class="form-help">
        Pick one or more managed repositories. For each picked repository set
        the mount path where it will be deployed inside the session workspace.
      </small>
      <div class="repository-picker-list">
        {repositories.map((repo) => {
          const current = existingByRepoId.get(repo.id);
          const selected = current !== undefined;
          return (
            <div class={`repository-picker-item ${selected ? "selected" : ""}`}>
              <div class="repository-picker-header">
                <label class="repository-picker-toggle">
                  <input
                    type="checkbox"
                    name="repoSelected[]"
                    value={repo.id}
                    checked={selected}
                  />
                  <strong>{repo.name}</strong>
                </label>
                <span class="repository-picker-url">
                  {repo.repoUrl} ({repo.repoType})
                </span>
              </div>
              <div class="repository-picker-fields">
                <div class="repository-picker-field">
                  <label>Mount path</label>
                  <input
                    type="text"
                    name={`mountPath_${repo.id}`}
                    value={current?.mountPath ?? repo.name}
                    placeholder={repo.name}
                  />
                </div>
                <div class="repository-picker-field">
                  <label>Source branch (optional)</label>
                  <input
                    type="text"
                    name={`sourceBranch_${repo.id}`}
                    value={current?.sourceBranch ?? ""}
                    placeholder="main"
                  />
                </div>
                <div class="repository-picker-field">
                  <label>New branch (optional)</label>
                  <input
                    type="text"
                    name={`newBranch_${repo.id}`}
                    value={current?.newBranch ?? ""}
                    placeholder="ai-session-my-feature"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <style>{`
        .repository-picker-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 8px;
        }
        .repository-picker-item {
          border: 1px solid #444;
          border-radius: 4px;
          padding: 10px 12px;
        }
        .repository-picker-item.selected {
          border-color: #6bafff;
        }
        .repository-picker-header {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .repository-picker-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .repository-picker-url {
          font-family: monospace;
          font-size: 11px;
          opacity: 0.7;
          word-break: break-all;
          flex: 1;
        }
        .repository-picker-primary {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
        }
        .repository-picker-fields {
          display: flex;
          gap: 12px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        .repository-picker-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
          min-width: 140px;
        }
        .repository-picker-field label {
          font-size: 11px;
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
};
