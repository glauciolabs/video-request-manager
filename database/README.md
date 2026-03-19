# Database options

Default stack in this scaffold uses **PostgreSQL** because order/SLA/report queries are strongly relational.

## Optional MongoDB path
- Keep `users`, `orders`, `notifications`, and `logs` as collections.
- Move relationship constraints and reporting consistency to application code.

## Backup strategy (Git storage)
- Use `scripts/db-backup.sh` to create dumps and push to any Git remote.
- Works with GitHub, Azure DevOps, or any Git-compatible SCM by changing `BACKUP_REPO_URL`.

## Production recommendation
- Use `CloudNativePG` as the PostgreSQL runtime in `production`.
- Keep `ScheduledBackup` enabled for operator-native backups.
- Keep the monthly `pg_dump -Fc` as a logical export to a private Azure DevOps repository.

### Files added to `app/production`
- `cnpg-cluster.yaml`: PostgreSQL cluster managed by CloudNativePG.
- `cnpg-scheduled-backup.yaml`: monthly CNPG `ScheduledBackup` using `volumeSnapshot`.
- `monthly-db-dump.yaml`: monthly `CronJob` that creates a logical dump and pushes it to Azure DevOps Git.
- `patch-secret.yaml`: placeholders for the Azure DevOps Git repository and PAT.

### Before applying in production
- Replace `change-me-volume-snapshot-class` in `app/production/cnpg-cluster.yaml`.
- Replace `vrm-db-user` password with a real value and keep it aligned with the app credentials.
- Fill `BACKUP_GIT_REPO_URL`, `BACKUP_GIT_USERNAME`, `BACKUP_GIT_PAT` in `app/production/patch-secret.yaml`.
- Confirm that the target Azure DevOps repository already exists and the PAT has push permission.
