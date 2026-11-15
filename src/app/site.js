// Which site this is. The admin tools (the Assessments page) are their own site,
// admin.kiscal.app: the same app, served from its own Hosting site (firebase.json), that
// shows only them. In development it's http://admin.localhost:3000, which browsers send
// to this machine on their own, like guides.localhost.

export const isAdminSite = (hostname = window.location.hostname) => /^admin\./i.test(hostname);

const LOCAL = /^(localhost|127\.0\.0\.1|(.+\.)?localhost)$/i;

// Where the admin site is, from the site this is. Not on a local address, nor on one of
// the Hosting addresses, which are the real one.
export function adminSiteUrl(location = window.location) {
  if (LOCAL.test(location.hostname)) return `${location.protocol}//admin.localhost${location.port ? `:${location.port}` : ""}/assessments`;
  return "https://admin.kiscal.app/assessments";
}

// And back, from the admin site to the student one.
export function studentSiteUrl(location = window.location) {
  if (LOCAL.test(location.hostname)) return `${location.protocol}//localhost${location.port ? `:${location.port}` : ""}/`;
  return "https://kiscal.app/";
}
