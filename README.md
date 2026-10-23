# Obusch / Design Club

Full-stack learning workspace for a mentor and students. The platform combines lessons, assignments, reviews, portfolio work, course building, and realtime communication in one dark editorial interface.

## Product flows

### Student

- works through lessons with video, materials, and checklists;
- submits assignments with files;
- receives rubric-based reviews and revision requests;
- maintains a portfolio;
- chats with the mentor in realtime.

### Mentor

- monitors students and progress;
- reviews work in a dedicated queue;
- grades by criteria and accepts or returns submissions;
- builds modules, lessons, and assignments;
- communicates with students through realtime chat.

## Tech stack

`Node.js` · `Express` · `Socket.IO` · `multer` · `bcryptjs` · session-based authentication · JSON persistence

## Local development

```bash
npm install
npm start
```

Open `http://localhost:3000`. Set a strong private `MENTOR_INVITE_TOKEN` in the server environment, then register the mentor using that invitation code. Never put the code in tracked files. Student registration needs no code. Existing mentor logins continue to work; without a configured code new mentor registration is closed.

## Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Application port |
| `NODE_ENV=production` | Enables secure cookies over HTTPS |
| `SESSION_SECRET` | Production session secret |
| `DATA_DIR` | Persistent database and upload directory |
| `MENTOR_INVITE_TOKEN` | Private invitation code required to register any mentor; Render generates it |
| `UPLOAD_USER_QUOTA_MB` | Per-user retained upload quota, default 100 MiB |
| `UPLOAD_TOTAL_QUOTA_MB` | Total upload quota, default 512 MiB, reserving space on the 1 GiB disk |

Attachments require a session and an owner/thread or mentor permission, and download as files rather than executing on the site. Existing linked attachments retain access; old unlinked files cannot be assigned an owner and stay inaccessible. Replaced homework files are removed when no longer referenced. Upload accounting includes unlinked files and active requests. Run one server process per JSON database/upload directory; this storage is not designed for multiple writers. Account and total quotas must leave capacity for the database and other disk use.

Run `npm test` for the isolated security regression suite.

Upload counts are additionally capped at 200 files per account and 2048 files per server directory, including in-flight reservations. Legacy files count toward the server quota even when their uploader cannot be identified.

Deployment notes are available in [DEPLOY.md](DEPLOY.md).



## Работа с изменениями и безопасность

Ветки задач, проверки CI, локальный Gitleaks и правила работы с секретами описаны в [CONTRIBUTING.md](CONTRIBUTING.md).

## Status

Learning-platform prototype. Validate authentication, persistence, upload storage and deployment configuration before using it with real students.

![Mentor overview](design_handoff_learning_platform/screens/10-mentor-overview.png)
