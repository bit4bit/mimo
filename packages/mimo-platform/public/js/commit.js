// Commit dialog functionality
(function() {
  const commitBtn = document.getElementById('commit-btn');
  const commitDialog = document.getElementById('commit-dialog');
  const commitMessage = document.getElementById('commit-message');
  const commitConfirm = document.getElementById('commit-confirm');
  const commitCancel = document.getElementById('commit-cancel');
  const commitError = document.getElementById('commit-error');
  const commitStatus = document.getElementById('commit-status');
  const syncNowBtn = document.getElementById('sync-now-btn');
  const syncStatus = document.getElementById('sync-status');

  if (!commitBtn || !commitDialog) return;

  const sessionId = window.MIMO_SESSION_ID || window.location.pathname.split('/').pop();

  function formatSyncStatus(status) {
    if (!status) {
      return 'Sync: unknown';
    }

    if (status.syncState === 'error') {
      return `Sync error: ${status.lastSyncError || 'Unknown error'}`;
    }

    if (status.syncState === 'syncing') {
      return 'Sync: syncing...';
    }

    if (status.lastSyncAt) {
      const time = new Date(status.lastSyncAt).toLocaleTimeString();
      return `Synced at ${time}`;
    }

    return 'Sync: idle';
  }

  async function refreshSyncStatus() {
    if (!sessionId || !syncStatus) {
      return;
    }

    try {
      const response = await fetch(`/sessions/${sessionId}/sync-status`);
      if (!response.ok) {
        return;
      }

      const status = await response.json();
      syncStatus.textContent = formatSyncStatus(status);
      syncStatus.style.color = status.syncState === 'error' ? '#ff6b6b' : '#888';
    } catch {
      // Ignore polling errors
    }
  }

  // Open dialog
  commitBtn.addEventListener('click', () => {
    commitDialog.style.display = 'flex';
    commitMessage.value = '';
    commitError.textContent = '';
    commitMessage.focus();
  });

  // Cancel
  commitCancel?.addEventListener('click', () => {
    commitDialog.style.display = 'none';
  });

  // Commit and push
  commitConfirm?.addEventListener('click', async () => {
    const message = commitMessage.value.trim();
    if (!message) {
      commitError.textContent = 'Please enter a commit message';
      return;
    }

    commitConfirm.disabled = true;
    commitConfirm.textContent = 'Committing...';
    commitError.textContent = '';

    try {
      const response = await fetch(`/commits/${sessionId}/commit-and-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      const result = await response.json();

      if (result.success) {
        commitDialog.style.display = 'none';
        commitStatus.textContent = result.message || 'Changes committed and pushed successfully!';
        commitStatus.style.color = '#51cf66';
        setTimeout(() => {
          commitStatus.textContent = '';
        }, 5000);
        // Refresh page to show updated changes
        window.location.reload();
      } else {
        // Handle different failure cases based on the step
        if (result.step === 'push') {
          commitDialog.style.display = 'none';
          commitStatus.textContent = `Committed but push failed: ${result.error || 'Unknown error'}`;
          commitStatus.style.color = '#ffd43b';
        } else {
          commitError.textContent = result.error || result.message || 'Commit failed';
        }
      }
    } catch (error) {
      commitError.textContent = `Error: ${error.message}`;
    } finally {
      commitConfirm.disabled = false;
      commitConfirm.textContent = 'Commit & Push';
    }
  });

  // Handle Escape key
  commitDialog?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      commitDialog.style.display = 'none';
    }
  });

  // Close on backdrop click
  commitDialog?.addEventListener('click', (e) => {
    if (e.target === commitDialog) {
      commitDialog.style.display = 'none';
    }
  });

  syncNowBtn?.addEventListener('click', async () => {
    if (!sessionId) {
      return;
    }

    syncNowBtn.disabled = true;
    syncNowBtn.textContent = 'Syncing...';

    try {
      const response = await fetch(`/sessions/${sessionId}/sync`, {
        method: 'POST',
      });
      const result = await response.json();

      if (result.success) {
        commitStatus.textContent = result.message || 'Sync completed';
        commitStatus.style.color = '#51cf66';
      } else {
        commitStatus.textContent = result.error || result.message || 'Sync failed';
        commitStatus.style.color = '#ff6b6b';
      }
    } catch (error) {
      commitStatus.textContent = `Sync failed: ${error.message}`;
      commitStatus.style.color = '#ff6b6b';
    } finally {
      syncNowBtn.disabled = false;
      syncNowBtn.textContent = 'Sync Now';
      await refreshSyncStatus();
    }
  });

  refreshSyncStatus();
  setInterval(refreshSyncStatus, 15000);
})();
