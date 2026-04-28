## REMOVED Requirements

### Requirement: Display credential info in project details
**Reason**: `ProjectDetailPage` is removed. Credential info is now shown in the right-panel metadata summary of the unified projects/sessions page (`unified-projects-sessions-view` spec).
**Migration**: Credential name display moves to `ProjectsSessionsPage` right-panel header. The MUST requirements on `ProjectDetailPage` in the original spec are superseded.

## REMOVED Requirements

### ProjectDetailPage component requirements
**Reason**: `ProjectDetailPage` component is deleted. Its responsibilities (showing project metadata and sessions) are absorbed by `ProjectsSessionsPage`.
**Migration**: See `unified-projects-sessions-view` spec for the new page requirements. `ProjectCreatePage` and `ProjectEditPage` requirements are unchanged.
