cd /d C:\Users\willi\engage-practice\backend
set DATABASE_URL=postgresql://engage:engage_dev_password@localhost:5433/engage_practice_dev
set PORT=3101
set CORS_ORIGIN=http://localhost:5273
set JWT_SECRET=engage-practice-dev-jwt-secret-min-32-chars-xx
set JWT_REFRESH_SECRET=engage-practice-dev-refresh-secret-min-32
set NODE_ENV=development
npx tsx src/index.ts
