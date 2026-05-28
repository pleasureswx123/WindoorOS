import { Worker } from "bullmq";

const connection = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379)
};

const worker = new Worker(
  "exports",
  async (job) => {
    if (job.name === "quote-pdf") {
      return {
        status: "SUCCESS",
        resultUrl: `/exports/${job.id}.pdf`,
        note: "MVP worker placeholder. PDF rendering will use Playwright in the production implementation."
      };
    }
    return { status: "IGNORED" };
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`Export job ${job.id} completed.`);
});

worker.on("failed", (job, error) => {
  console.error(`Export job ${job?.id} failed.`, error);
});
