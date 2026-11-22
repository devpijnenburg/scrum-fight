// Central job registry. Every background job lives in its own module under
// src/jobs/ and only handles scheduling + logging; the actual work is
// delegated to the owning domain under src/domain/.
const roomCleanupJob = require('./roomCleanupJob');
const loginCodeCleanupJob = require('./loginCodeCleanupJob');

const JOBS = [roomCleanupJob, loginCodeCleanupJob];

// Scheduled tasks returned by each job's register(), so they can be stopped
// on shutdown.
let tasks = [];

function startJobs() {
  tasks = JOBS.map((job) => job.register());
  console.log(`[jobs] ${JOBS.length} background job(s) scheduled`);
}

function stopJobs() {
  for (const task of tasks) task?.stop();
  tasks = [];
}

module.exports = { startJobs, stopJobs };
