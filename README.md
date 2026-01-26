# Project NONCON Web Structure

- All frontend code (React) and backend PHP live inside this `php/` directory for easier container mounting.
- React application lives under `php/frontend/` (Vite + React 18). Build output is written to `php/frontend/dist`.
- Shared styling lives in `php/css/` and is imported into React via the alias `@css/*`.
- Backend helper utilities (database, APIs) remain in `php/server/`.
- Docker image installs Node.js and runs `npm install` + `npm run build` automatically in `php/frontend` every time the PHP container starts, so visiting `http://localhost:8080` just works.

## Local workflow

```bash
cd php/frontend
npm install
npm run dev   # optional local dev server on http://localhost:5173
npm run build # only needed if you want to compile outside Docker
```

The Apache/PHP container serves `php/index.php`. On startup it builds the React bundle; until that finishes, the page shows a “Frontend กำลังสร้างอยู่” message. Database diagnostics remain at `php/status.php`.
