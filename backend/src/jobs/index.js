// Central job registry. Every background job lives in its own module under
// src/jobs/ and only handles scheduling + logging; the actual work is
// delegated to the owning domain under src/domain/.
const roomCleanupJob = require('./roomCleanupJob');

const JOBS = [roomCleanupJob];

function startJobs() {
  for (const job of JOBS) job.register();
  console.log(`[jobs] ${JOBS.length} background job(s) scheduled`);
}

module.exports = { startJobs };
