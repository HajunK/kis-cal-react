// Hands src/core to the plain scripts in public/js, which share globals rather
// than importing. Each page loads this module before them: module and defer
// scripts run in document order, so these exist by the time those run.
//
// The pure helpers become globals under their own names. The schedule's take
// the school data as arguments, so assessments-shared.js wraps them with the
// data it has loaded instead (see KisCore.schedule there).

import * as admins from "../core/admins.js";
import * as catalog from "../core/catalog.js";
import * as crypto from "../core/crypto.js";
import * as dates from "../core/dates.js";
import * as grades from "../core/grades.js";
import * as schedule from "../core/schedule.js";
import * as sync from "../core/sync.js";

window.KisCore = { admins, catalog, crypto, dates, grades, schedule, sync };
Object.assign(window, admins, catalog, crypto, dates, grades, sync);
