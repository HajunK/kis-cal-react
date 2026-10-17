// Whether a course has a final decides its grading split (20/60/20 vs 20/80).
export const COURSE_CATALOG = [
  { name: "Algebra II", ap: false, final: false, weight: 1},
  { name: "AP Art", ap: true, final: false, weight: 1, divisions: ["2D", "3D"] },
  { name: "Biology", ap: false, final: false, weight: 1 },
  { name: "AP Biology", ap: true, final: false, weight: 1 },
  { name: "Calculus", ap: false, final: false, weight: 1 },
  { name: "AP Calculus", ap: true, final: false, weight: 1, divisions: ["AB", "BC"] },
  { name: "Chamber Choir", ap: false, final: false, weight: 1 },
  { name: "Chemistry", ap: false, final: false, weight: 1 },
  { name: "AP Chemistry", ap: true, final: false, weight: 1 },
  // Sections that test on different days; everything else is shared.
  { name: "Chinese", ap: false, final: false, weight: 1, divisions: ["I", "II", "III", "IV"] },
  { name: "AP Chinese", ap: true, final: false, weight: 1 },
  { name: "Heritage Chinese", short: "Chinese", ap: false, final: false, weight: 1 },
  { name: "Choir", ap: false, final: false, weight: 1 },
  { name: "AP Comparative Gov", ap: true, final: false, weight: 1 },
  { name: "Concert Band", ap: false, final: false, weight: 1 },
  { name: "Creative Writing", ap: false, final: false, weight: 1 },
  { name: "AP CSA", ap: true, final: false, weight: 1 },
  { name: "AP CSP", ap: true, final: false, weight: 1 },
  { name: "Debate", ap: false, final: false, weight: 1 },
  { name: "Design and Tech", ap: false, final: false, weight: 1 },
  { name: "Advanced Design and Tech", short: "Design and Tech", ap: false, final: false, weight: 1 },
  { name: "Digital Photography", ap: false, final: false, weight: 1 },
  { name: "Earth Science", ap: false, final: false, weight: 1 },
  { name: "Economics", ap: false, final: false, weight: 1 },
  { name: "AP Economics", ap: true, final: false, weight: 1, divisions: ["Mic", "Mac"] },
  { name: "Engineering", ap: false, final: false, weight: 1 },
  { name: "Advanced Engineering", short: "Engineering", ap: false, final: false, weight: 1 },
  { name: "English", ap: false, final: false, weight: 1, divisions: ["9", "10", "11", "12"] },
  { name: "AP Language", ap: true, final: false, weight: 1 },
  { name: "AP Literature", short: "AP Lit", ap: true, final: false, weight: 1 },
  { name: "AP Environmental Science", short: "AP ES", ap: true, final: false, weight: 1 },
  { name: "Ethics", ap: false, final: false, weight: 1 },
  { name: "Film as Literature", ap: false, final: false, weight: 1 },
  { name: "Geometry", ap: false, final: false, weight: 1 },
  { name: "Global Studies", ap: false, final: false, weight: 1, divisions: ["9", "10", "11", "12"] },
  { name: "Graphic Design", ap: false, final: false, weight: 1 },
  { name: "Hajun Studies", ap: false, final: false, weight: 0 },
  { name: "Health & Fitness", short: "PE", ap: false, final: false, weight: 1 },
  { name: "AP Human Geography", short: "AP HuG", ap: true, final: false, weight: 1 },
  { name: "Individual/Dual Pursuits", short: "PE", ap: false, final: false, weight: 1 },
  { name: "Journalism", ap: false, final: false, weight: 1 },
  {
    name: "Korean",
    ap: false,
    final: false,
    weight: 1,
    message: "",
    divisions: ["9", "10"],
    combo: [
      { name: "Korean Language", ap: false, final: false, weight: 0.5 },
      { name: "Korean SS", ap: false, final: false, weight: 0.5 },
    ],
  },
  { name: "Linear Algebra", ap: false, final: false, weight: 1 },
  { name: "Lunch", ap: false, final: false, weight: 0 },
  { name: "AP Lunch", ap: true, final: false, weight: 0 },
  { name: "Modern Band", ap: false, final: false, weight: 1 },
  { name: "Movement & Expression", short: "PE", ap: false, final: false, weight: 1 },
  { name: "Multivariable Calculus", short: "Multivariable", ap: false, final: false, weight: 1 },
  { name: "AP Music Theory", ap: true, final: false, weight: 1 },
  { name: "Personal Fitness", short: "PE", ap: false, final: false, weight: 1 },
  { name: "Physics", ap: false, final: false, weight: 1 },
  { name: "AP Physics", ap: true, final: false, weight: 1, divisions: ["1", "C"] },
  { name: "Pre-Calculus", ap: false, final: false, weight: 1 },
  { name: "Programming", ap: false, final: false, weight: 1, divisions: ["I", "II"] },
  { name: "Psychology", ap: false, final: false, weight: 1 },
  { name: "AP Psychology", short: "AP Psych", ap: true, final: false, weight: 1 },
  { name: "Public Speaking", ap: false, final: false, weight: 1 },
  { name: "Recreational & Lifetime Sports", short: "PE", ap: false, final: false, weight: 1 },
  { name: "AP Research", ap: true, final: false, weight: 1 },
  { name: "Robotics", ap: false, final: false, weight: 1 },
  { name: "Advanced Robotics", short: "Robotics", ap: false, final: false, weight: 1 },
  { name: "AP Seminar", ap: true, final: false, weight: 1 },
  { name: "Sociology", ap: false, final: false, weight: 1 },
  { name: "Solo Vocal Technique", short: "Solo Vocal", ap: false, final: false, weight: 1 },
  { name: "Spanish", ap: false, final: false, weight: 1, divisions: ["I", "II", "III", "IV"] },
  { name: "AP Spanish", ap: true, final: false, weight: 1 },
  { name: "AP Statistics", short: "AP Stats", ap: true, final: false, weight: 1 },
  { name: "String Orchestra", ap: false, final: false, weight: 1 },
  { name: "Advanced String Orchestra", short: "Orchestra", ap: false, final: false, weight: 1 },
  { name: "Theater", ap: false, final: false, weight: 1 },
  { name: "Advanced Theater", short: "Theater", ap: false, final: false, weight: 1 },
  { name: "AP US Gov", ap: true, final: false, weight: 1 },
  { name: "US History", ap: false, final: false, weight: 1 },
  { name: "AP US History", short: "AP USH", ap: true, final: false, weight: 1 },
  { name: "Videography", ap: false, final: false, weight: 1 },
  { name: "Visual Art", ap: false, final: false, weight: 1 },
  { name: "Wellness", ap: false, final: false, weight: 1 },
  { name: "Wind Ensemble", short: "Wind", ap: false, final: false, weight: 1 },
  { name: "AP World History", short: "AP WH", ap: true, final: false, weight: 1 },
  { name: "Writing", ap: false, final: false, weight: 1 },
  { name: "Yearbook", ap: false, final: false, weight: 1 },
];

// Combo courses' sub-entries live inside their parent, so they're searched too.
export function findCourseCatalogEntry(name) {
  for (const course of COURSE_CATALOG) {
    if (course.name === name) return course;
    if (course.combo) {
      const sub = course.combo.find((c) => c.name === name);
      if (sub) return sub;
    }
  }
  return null;
}

export function shortCourseName(name) {
  const [, base, division = ""] = name.match(/^(.*?)( \([^)]*\))?$/);
  const course = findCourseCatalogEntry(base);
  return course && course.short ? course.short + division : null;
}

// One schedule slot can be two separate classes ("Korean" is Korean Lang +
// Korean SS).
export function expandCourseNames(names) {
  return names.flatMap((name) => {
    const course = COURSE_CATALOG.find((c) => c.name === name);
    return course && course.combo ? course.combo.map((c) => c.name) : [name];
  });
}

// Assessments are scheduled per division, so the match key includes it
// ("English (10)"). Never displayed.
export function effectiveCourseName(courseName, division) {
  return division ? `${courseName} (${division})` : courseName;
}
