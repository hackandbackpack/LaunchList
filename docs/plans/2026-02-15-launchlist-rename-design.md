# LaunchList Rename Design

## Overview
Rename project from "listpull" / "ListPull" to "LaunchList" across all code, config, docs, and GitHub.

## Naming Convention
- **PascalCase everywhere**: LaunchList.env, LaunchList.db, LaunchList-data, LaunchList.service
- **GitHub repo**: hackandbackpack/LaunchList

## Files Modified
- index.html, server/package.json, server/package-lock.json
- server/src/config.ts, src/lib/config.ts, server/src/services/discordService.ts
- Dockerfile, docker-compose.yml, .gitignore
- LaunchList.env.example (renamed from listpull.env.example)
- deploy/LaunchList.service (renamed from deploy/listpull.service)
- deploy/nginx.conf, deploy/install.sh, deploy/uninstall.sh, deploy/deploy.py
- deploy/README.md, README.md, scripts/backup.sh
- docs/plans/*.md

## What Doesn't Change
- Local directory name on disk
- Git history
