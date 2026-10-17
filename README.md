# KIS Cal

A grade calculator, assessment calendar and GPA tool for KIS students. Grades are
encrypted on each student's device; courses, assessments and the bell schedule
are stored in Firebase.

## Run it

```
npm install
npm run dev        # http://localhost:5173, with the same clean URLs and redirects as Firebase Hosting
npm test           # the core logic's tests (Vitest)
npm run build      # into dist/
firebase deploy    # builds first (see predeploy in firebase.json), then deploys dist/ and the Firestore rules
```

## Structure

```
domain.html, calendar.html, gpa.html      The student tabs, one page each (Vite builds every page listed in vite.config.js)
assessments.html, posts.html              Admin-only tabs
calendar-demo.html                        The Calendar with made-up data and no Firebase
src/core/                                 Logic with no page access, each with *.test.js beside it:
  catalog.js                                the course list (AP, finals, divisions, short names, combo courses)
  grades.js                                 letter grades, score entry, a Domain card's weighted grade, target scores, GPA
  schedule.js                               the bell schedule and when assessments happen
  crypto.js                                 the encryption format for the grade fields
  sync.js                                   appData's shape and the sync decisions
  dates.js                                  local YYYY-MM-DD dates
src/legacy/core-globals.js                Hands src/core to the scripts in public/js as globals
public/                                   Copied into the build unchanged
  js/                                       The page scripts (plain scripts sharing globals; boot.js starts each page)
  css/, fonts/, icons/, grade-icons/
firebase.json, firestore.rules            Hosting config and the security rules (the real admin gate)
```

Each page loads `core-globals.js` as a module ahead of its plain scripts, so they
can use the core functions (`letterGradeForScore`, `toISODate`, ...) as before.
The schedule functions take the school data as arguments; `assessments-shared.js`
wraps them with the data it has loaded.

## Data (Firestore)

- `users/{uid}`: one doc per student: periods, divisions, hidden courses, their own
  assessments and completed tasks, preferences, and the encrypted `domainScores`,
  `gpaClasses` and `domainSnapshot`.
- `assessments`, `dayTypes`, `periodTimes/default`, `posts`: school-wide, readable
  by anyone, written by admins.
- `suggested`: assessments students added that the school calendar is missing.
- `meta/cacheVersions`: when each school-wide collection last changed, so pages
  only refetch what changed.
