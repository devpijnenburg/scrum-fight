// Central job registry. Every background job lives in the domain that owns
// the work (src/domains/<domain>/*Job.js) and only handles scheduling and
// logging; this file decides which jobs run.
const roomCleanupJob = require('../domains/rooms/roomCleanupJob');
const loginCodeCleanupJob = require('../domains/identity/loginCodeCleanupJob');
const liveRoundCleanupJob = require('../domains/game/liveRoundCleanupJob');
const { createLogger } = require('../shared/logger');

const log = createLogger('jobs');

const JOBS = [roomCleanupJob, loginCodeCleanupJob, liveRoundCleanupJob];

// Scheduled tasks returned by each job's register(), so they can be stopped
// on shutdown.
let tasks = [];

function startJobs() {
  tasks = JOBS.map((job) => job.register());
  log.info('Achtergrondjobs ingepland', { jobs: JOBS.length });
}

function stopJobs() {
  for (const task of tasks) task?.stop();
  tasks = [];
}

module.exports = { startJobs, stopJobs };
