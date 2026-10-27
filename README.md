# KIS Cal

A grade calculator, assessment calendar and GPA tool for KIS students. Grades are
encrypted on each student's device; courses, assessments and the bell schedule
are stored in Firebase.

## Run it

```
npm install
npm run dev        # http://localhost:3000 (always that port; it says so if it's taken), with the
                   # same redirects as Firebase Hosting; the study guides are at http://guides.localhost:3000
npm test           # the tests (Vitest)
npm run build      # into dist/
firebase deploy    # builds first (see predeploy in firebase.json), then deploys dist/ and the Firestore rules
```

`http://guides.localhost:3000` is the guides site (`guides/`, `dev/guidesServer.js`), answered the
way its Hosting site is: files as they are, `/biology` for its folder, anything else is
`guide.html`. Browsers send `*.localhost` to your machine themselves. Google sign-in there needs
`guides.localhost` under Authentication > Settings > Authorized domains in the Firebase console
(`localhost` alone covers only `localhost:3000`).

## Who can read what

`firestore.rules` is the real gate; the Firebase settings in the page are public by design.
- `users/{uid}`: only that signed-in user (their added assessments, scores, preferences).
- `suggested` (what students add that the school's calendar lacks, with the emails of who
  suggested it): **admins only**. Students only write to it.
- `reportedAssessments` (a student's "This is wrong" on a school-wide assessment, one document per
  assessment with the emails of who flagged it): students write, **admins only** read. It shows on the
  Assessments page beside the suggestions, where an admin deletes the assessment or dismisses the report.
- `assessments`: **signed-in users only**, so it can't be pulled with just the public settings.
  A visit without a sign-in carries on without them (`retryAssessmentsAfterSignIn` in
  `src/shell/school.js` reads them once someone signs in).
- `dayTypes`, `periodTimes`, `meta`: open, so the time-left pill works before signing in.

Deploy the new app (`firebase deploy --only hosting`) **before** the rules
(`firebase deploy --only firestore:rules`): the previous app doesn't know to carry on when
the assessments are refused, so a visitor who isn't signed in would lose the schedule until it's replaced.
Still to do, outside the code: Firebase App Check (register a reCAPTCHA v3 key in the console, activate
it in the app, check the metrics, then enforce it for Firestore), and a made-up entry in a
school-wide list to recognise a copy by.

## Structure

One page, `index.html`; React Router picks the tab from the path (`/domain`,
`/calendar`, `/gpa`, `/assessments`, `/calendar-demo`), and Firebase
Hosting serves that page for every path.

```
index.html                                The app's one page (theme set before first paint, Firebase's compat SDK; Vite adds the bundled stylesheet)
src/app/                                  The app: main.jsx starts it; AppShell.jsx (routes, popups), TabBar.jsx (tabs and their
                                            sliding underline), Account.jsx (avatar, account menu, sign-in), ClassCountdown.jsx and
                                            todaySchedule.js (the time-left pill and the schedule it opens), DecryptionPrompt.jsx
                                            (the login key prompt), demo.js (the Calendar demo's made-up data)
src/shell/                                What every tab shares, in plain modules:
  session.js                                who's signed in and whose data is shown: the cached copy at once, confirmed from the
                                            server, then kept in step with changes made elsewhere, put in place without a reload
  data.js                                   the student's data (appData), its cache on this device, saving it, the device key
  preferences.js                            the preferences, applied as they change and saved to the account
  school.js                                 the assessments, A/B days and bell schedule, cached and refetched only when changed
  schedule.js, openTab.js                   what's on right now; how the open tab is redrawn from outside
  ui.js                                     the number roll, the toast, hover tooltips, themed icons
  firebase.js                               the Firebase app (and the switch the demo turns it off with)
src/core/                                 Logic with no page access, each with *.test.js beside it:
  catalog.js                                the course list (AP, finals, divisions, short names, combo courses)
  grades.js                                 letter grades, score entry, a Domain card's weighted grade, target scores, GPA
  schedule.js                               the bell schedule and when assessments happen
  crypto.js                                 the encryption format for the grade fields
  sync.js                                   appData's shape and the sync decisions
  dates.js                                  local YYYY-MM-DD dates
  admins.js                                 the admin email list (cosmetic; firestore.rules is the gate)
src/domain/                               The Domain tab: the cards' row (DomainPage.jsx), each card (ClassCard.jsx),
                                            its scores and rules (cardState.js, tested), the date picker; motion.js, scoreLists.js,
                                            pageScroll.js and linkTip.js keep the old animations and scrolling unchanged
src/calendar/                             The Calendar tab: React page and side panel (CalendarPage.jsx), its logic (model.js, tested),
                                            and the grids, Upcoming list and Add popup (calendar.js, classGrid.js, addPopup.js, pills.js)
                                            with their old motion unchanged
src/gpa/                                  The GPA tab; badgeMotion.js keeps the old animations
src/admin/                                The Assessments admin tab (calendar, A/B days, Bell Schedule, Suggestions); bellSchedule.js keeps the old drag code
src/popups/                               The account menu's popups (Settings, Login Key, My Courses) and Learn More
src/ui/                                   Shared React components: Modal, ConfirmDialog, Toast, SegmentedControl, ToggleSwitch
src/test/fakeFirebase.js                  In-memory Firestore and Auth for tests; records every write
src/css/                                  The stylesheets, imported by src/app/main.jsx; Vite bundles them into one minified, hashed file
guides/                                   The guides.kiscal.app site (plain static files, its own Firebase Hosting site, kiscal-guides)
public/                                   Copied into the build unchanged: fonts/, icons/, grade-icons/, js/vendor/ (QR code libraries)
firebase.json, firestore.rules            Hosting config and the security rules (the real admin gate)
```

A change made on another device (or another tab) is put in place and the open
tab redrawn from it, once nothing is being typed; signing in or out does the
same. Only Settings' "Delete all data" and the login key prompt's reset still
reload, as they clear this device's cached preferences too.

## Data (Firestore)

- `users/{uid}`: one doc per student: periods, divisions, hidden courses, their own
  assessments and completed tasks, preferences, and the encrypted `domainScores`,
  `gpaClasses` and `domainSnapshot`.
- `assessments`, `dayTypes`, `periodTimes/default`: school-wide, readable
  by anyone, written by admins. (`posts` is still there from the removed Posts
  feature; nothing reads it now.)
- `suggested`: assessments students added that the school calendar is missing.
- `meta/cacheVersions`: when each school-wide collection last changed, so pages
  only refetch what changed.

## Suggestion alerts (Mac notifications for admins)

An admin who switches on Settings > "Notify suggestions" gets a
notification on their Mac when a student suggests an assessment, while KIS Cal is
open in that browser (any tab, in the background too; nothing when the browser or
the site is closed).

It watches the `suggested` list the Assessments tab already reads (anyone may read
it), so there's nothing to deploy: no function, no rules change. The choice is
kept per browser. The code is src/shell/notifications.js.

## Guides site (guides.kiscal.app)

Study guides for test prep, in `guides/`: plain static files (no build step) on
their own Firebase Hosting site (`kiscal-guides`, also kiscal-guides.web.app);
firebase.json lists it beside the app's site.

- A guide's address is its key: `guides.kiscal.app/biology` is the guide whose
  key is `biology`. Hosting sends any address that isn't one of the site's own
  files to `guide.html`, which reads the key from the address. A key is required
  when a guide is made, is lowercase letters, numbers and single hyphens (2 to
  40 characters), can't be one of the names the site uses (`RESERVED_KEYS` in
  `js/guides.js`, repeated in firestore.rules), must be new, and can't be
  changed afterwards.
- `index.html` + `js/home.js`: search (title, course, test or key), a sort, a
  grid of guide cards, a "Recently viewed" row. `guide.html` + `js/guide.js`: one
  guide.
- Guides are Firestore documents in `guides`, named by their key (published ones
  readable by anyone, drafts and all writes admin-only); their pictures are in
  Cloud Storage under `guides/<key>/`. firestore.rules and storage.rules are the
  real gate; `ADMIN_EMAILS` in `js/config.js` only shows or hides the controls.
- An admin signs in with Google (the "Admin sign in" link at the bottom), then
  gets New guide and Edit buttons. The editor shrinks pictures in the browser
  (a 16:9 card picture, body pictures up to 1600 px) and uploads them from there.
- A guide can also be a page of its own: `guides/biology/index.html` (with its pictures
  beside it) is served at `/biology` ahead of the rewrite, with no Firestore
  document or Storage. It isn't in the home grid or the editor, and its key can't
  also be made as a guide.
- Counting readers (`js/views.js`, no sign-in): the first time a browser opens a guide it
  adds `guideViews/<guide key>__<random 32-character browser id>` (the key and the time),
  kept in localStorage so it happens once per guide per browser; it's skipped for an admin
  and on localhost. firestore.rules lets anyone create one with exactly that shape and never
  change or read it back; only an admin can list them. The guides home has a **Views** button
  for admins that totals them per guide (including a page of its own like `/biology`). It's
  readers' browsers, not people: clearing site data or switching browser counts again, and
  anyone could write made-up documents, so treat the numbers as a guide. The rules need
  deploying (`firebase deploy --only firestore:rules`) before counting works.
- All the glass controls on a guide page (the zoom control, the round back arrow to KIS
  Cal, and the bottom pill with the sign-in and star rating) come from one script,
  `js/guide-ui.js`, styled by guides.css, and nothing about them is in a page's own
  HTML. `guide.html` (so every guide made in the editor) loads it, and a page of
  its own, like `/biology`, needs only `<link rel="stylesheet" href="/guides.css" />`
  and `<script type="module" src="/js/guide-ui.js"></script>`.
- Every guide page gets a zoom control (50% to 250%, top-right) from `js/zoom.js`
  and `.zoom` in guides.css, not from the page's own HTML: `guide.html` and any page
  of its own just load the script. It sets `--zoom` on the page; a guide's text
  scales through the `.zoomable` class, and `/biology` reads `--zoom` for its pictures.
- Rating a guide (`js/rating.js`, `js/app-link.js`): signed out, a "Sign in to KIS Cal"
  pill rises at the bottom when you scroll nearly to the end; signed in, five stars sit
  beside the back arrow at the top. A rating is one Firestore document,
  `guideRatings/<guide key>__<user id>` (the key, a whole number 1 to 5 and the time), so
  each person has one rating per guide, which they can change: firestore.rules lets a
  signed-in user create and replace their own and never delete it, lets them read only
  their own, and lets only an admin list or read the rest. It needs `guides.kiscal.app`
  (and `kiscal-guides.web.app`) in Authentication > Settings > Authorized domains, and
  `firebase deploy --only firestore:rules`.
- All the glass controls on a guide page (the zoom control, the round back arrow to KIS
  Cal, and the bottom pill with the sign-in and star rating) come from one script,
  `js/guide-ui.js`, styled by guides.css, and nothing about them is in a page's own
  HTML. `guide.html` (so every guide made in the editor) loads it, and a page of
  its own, like `/biology`, needs only `<link rel="stylesheet" href="/guides.css" />`
  and `<script type="module" src="/js/guide-ui.js"></script>`.
- Every guide page gets a zoom control (50% to 250%, top-right) from `js/zoom.js`
  and `.zoom` in guides.css, not from the page's own HTML: `guide.html` and any page
  of its own just load the script. It sets `--zoom` on the page; a guide's text
  scales through the `.zoomable` class, and `/biology` reads `--zoom` for its pictures.
- Every guide page ends with a pill that rises when you scroll nearly to the bottom
  (`js/app-link.js`): "Log in with Google" until you are signed in, then five stars to
  rate the guide, above "Study Guide made by Hajun Kim". A rating is one Firestore
  document, `guideRatings/<guide key>__<user id>` (the key, a whole number 1 to 5 and
  the time), so each person has one rating per guide, which they can change:
  firestore.rules lets a signed-in user create and replace their own and never
  delete it, lets them read only their own, and lets only an admin list or read the
  rest. It needs `guides.kiscal.app` (and
  `kiscal-guides.web.app`) in Authentication > Settings > Authorized domains, and
  `firebase deploy --only firestore:rules`. The code is `js/rating.js`.
- `js/guides.js`, `markdown.js` and `images.js` are plain functions with tests.

Pictures are off for now, since Storage needs the Blaze plan: the editor has no card
picture or Add image (commented out, marked "Image upload" in `js/editor.js`), and
firebase.json has no `storage` section, so `firebase deploy` doesn't touch Storage.
A guide's text can still show a picture from its own address (a Markdown
`![alt](https://…)` link), and a page like `guides/biology/` carries its own files.
To bring uploads back: upgrade to Blaze, create the bucket (Firebase console >
Storage > Get started), put back the commented-out code and the section
`"storage": { "rules": "storage.rules" }` in firebase.json, then deploy `storage`.

Before the editor can save anything (once):

1. In Authentication > Settings > Authorized domains, add `guides.kiscal.app`
   and `kiscal-guides.web.app`.
2. `firebase deploy --only firestore:rules`. This replaces the live rules with the
   ones in this repo, so check them first.

Run it locally with `firebase emulators:start --only hosting` (guide addresses
like `/biology` need Hosting's rewrite; a plain file server only serves the home
page). Deploy just this site with `firebase deploy --only hosting:kiscal-guides`,
and the app's with `firebase deploy --only hosting:kisj-grade-calculator`. A plain
`firebase deploy --only hosting` publishes both.
