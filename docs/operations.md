# Operations

The complete production installation, update, backup and disaster-recovery procedures are in [the VPS guide](VPS.md). Review [the security guide](SECURITY.md) and [feature status](STATUS.md) before exposing DeployHub to the Internet.

```bash
bash infrastructure/scripts/health.sh
bash infrastructure/scripts/backup.sh
bash infrastructure/scripts/update.sh
```

The backup script quiesces the API and worker while keeping already published sites serving. Restoring requires an explicitly authorized operation on a fresh database and empty data directory. Backup scheduling uses the provided cron example; scheduling and retention are not dashboard features.
