# OpenSpec Workflow

This project uses OpenSpec for structured change management.

## Required Flow

1. **Explore mode**
   - `/opsx:explore <topic>`
2. **Create change artifacts**
   - `/opsx:new <change-name>` or `/opsx:ff <change-name>`
   - Artifacts in order: `proposal.md -> design.md -> specs/**/*.md -> tasks.md`
3. **Implement**
   - `/opsx:apply <change-name>`
   - Mark tasks complete as you go: `- [ ]` -> `- [x]`
4. **Verify**
   - `/opsx:verify <change-name>`
5. **Archive**
   - `/opsx:archive <change-name>`
