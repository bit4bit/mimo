// Commit dialog functionality
(function() {
  const commitBtn = document.getElementById('commit-btn');
  const commitDialog = document.getElementById('commit-dialog');
  const commitMessage = document.getElementById('commit-message');
  const commitConfirm = document.getElementById('commit-confirm');
  const commitCancel = document.getElementById('commit-cancel');
  const commitError = document.getElementById('commit-error');
  const commitStatus = document.getElementById('commit-status');

  if (!commitBtn || !commitDialog) return;

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

    const sessionId = window.location.pathname.split('/').pop();

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
})();
