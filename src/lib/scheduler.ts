/**
 * Background job scheduler.
 *
 * Wraps node-cron with a small registry so the bot can fire alert
 * checks, set release polls, and daily report posts on a schedule.
 *
 * Each job is registered with a name + cron expression + handler.
 * On bot startup, `startScheduler(client)` schedules them all and
 * passes the live Discord client into each handler so they can
 * send messages or DMs.
 */

import type { Client } from "discord.js";
import cron from "node-cron";

export interface ScheduledJob {
  name: string;
  /** Standard 5-field cron expression. */
  cron: string;
  handler(client: Client): Promise<void>;
}

const jobs: ScheduledJob[] = [];

/** Register a job. Call this at module load time of each worker file. */
export function registerJob(job: ScheduledJob): void {
  jobs.push(job);
}

/**
 * Start every registered job. Idempotent — safe to call multiple
 * times if the bot reconnects, though we never actually do.
 */
export function startScheduler(client: Client): void {
  for (const job of jobs) {
    cron.schedule(job.cron, async () => {
      try {
        await job.handler(client);
      } catch (err) {
        console.error(`[scheduler] job ${job.name} failed:`, err);
      }
    });
    console.log(`[scheduler] registered ${job.name} (${job.cron})`);
  }
}
