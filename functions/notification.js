// What the push for a new suggestion says, and which devices to forget after
// sending. Plain functions, no Firebase here, so they're tested on their own.

// "2026-10-02" -> "Oct 2". Anything else is shown as it came.
export function shortDate(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  if (!match) return String(date || "");
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return day.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// An address on this site's own origin, only ever https (what an admin's
// device recorded for itself).
function siteOrigin(device) {
  try {
    const url = new URL(device.origin);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

// One device's message. Clicking it opens the Assessments tab, on whichever
// site (kisjcalc.com, kiscal.app) that device registered from.
export function buildMessage(suggestion, device) {
  const origin = siteOrigin(device);
  const message = {
    token: device.token,
    notification: {
      title: "New suggestion",
      body: `${suggestion.courseName} · ${suggestion.type} · ${shortDate(suggestion.date)}`,
    },
  };
  if (origin) {
    message.webpush = {
      fcmOptions: { link: `${origin}/assessments` },
      notification: { icon: `${origin}/icons/logos/page-icon.png`, tag: "kiscal-suggestion" },
    };
  }
  return message;
}

const GONE = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"]);

// The devices whose sending failed because the browser no longer has that
// registration (the site's permission was withdrawn, the browser data was
// cleared). devices and responses are in the same order.
export function staleTokens(devices, responses) {
  return devices.filter((_, i) => !responses[i].success && GONE.has(responses[i].error?.code)).map((device) => device.token);
}
