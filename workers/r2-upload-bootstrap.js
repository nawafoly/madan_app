import uploadWorker from "./r2-upload-worker.js";
import { configureAttendanceHrDb } from "./attendance-worker.js";

export default {
  async fetch(request, env, ctx) {
    configureAttendanceHrDb(env?.HR_DB || null);
    return uploadWorker.fetch(request, env, ctx);
  },
};
