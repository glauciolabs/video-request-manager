# Database options

Default stack in this scaffold uses **PostgreSQL** because order/SLA/report queries are strongly relational.

## Optional MongoDB path
- Keep `users`, `orders`, `notifications`, and `logs` as collections.
- Move relationship constraints and reporting consistency to application code.

## Backup strategy (Git storage)
- Use `scripts/db-backup.sh` to create dumps and push to any Git remote.
- Works with GitHub, Azure DevOps, or any Git-compatible SCM by changing `BACKUP_REPO_URL`.
