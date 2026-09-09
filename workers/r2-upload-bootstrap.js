import uploadWorker from "./r2-upload-worker.js";
import { configureAttendanceHrDb } from "./attendance-worker.js";
import { configureHabatRealtimeBinding } from "./habat-realtime.js";

export { HabatRealtimeHub } from "./habat-realtime.js";

export default {
  async fetch(request, env, ctx) {
    configureAttendanceHrDb(env?.HR_DB || null);
    configureHabatRealtimeBinding(env?.HABAT_REALTIME || null);
    return uploadWorker.fetch(request, env, ctx);
  },
};
