// Loads a clearly marked example team through the API.
// Usage: node seed.mjs https://xxxx.execute-api.us-east-1.amazonaws.com
const api = (process.argv[2] || process.env.API_URL || "").replace(/\/$/, "");
if (!api) {
  console.error("Usage: node seed.mjs <API_URL>");
  process.exit(1);
}

const EXAMPLE = {
  settings: [{ id: "team", supervisor: "Your name here" }],
  members: [
    { id: "m1", name: "Alex Rivera (example)", title: "Senior Backend Engineer", stack: ["Go", "PostgreSQL", "Kafka"], meetingDay: 1, meetingTime: "10:00", order: 1 },
    { id: "m2", name: "Priya Nair (example)", title: "Frontend Engineer", stack: ["TypeScript", "React", "Next.js"], meetingDay: 2, meetingTime: "14:00", order: 2 },
    { id: "m3", name: "Sam Okafor (example)", title: "DevOps Engineer", stack: ["Terraform", "AWS", "Kubernetes"], meetingDay: 3, meetingTime: "11:00", order: 3 },
    { id: "m4", name: "Mei Chen (example)", title: "Data Engineer", stack: ["Python", "Airflow", "dbt", "Snowflake"], meetingDay: 4, meetingTime: "09:30", order: 4 },
    { id: "m5", name: "Jordan Blake (example)", title: "QA Automation Engineer", stack: ["Playwright", "Jest", "GitHub Actions"], meetingDay: 5, meetingTime: "15:00", order: 5 },
  ],
  tasks: [
    { id: "t1", memberId: "m1", title: "Migrate payments service to gRPC", stack: ["Go", "gRPC", "PostgreSQL"], status: "doing", progress: 70, due: "2026-10-30", issue: "Latency spikes under load test at 2k rps.", obstacles: "" },
    { id: "t2", memberId: "m1", title: "Kafka consumer retry policy", stack: ["Go", "Kafka"], status: "done", progress: 100, due: "2026-10-02", issue: "", obstacles: "" },
    { id: "t3", memberId: "m2", title: "Redesign checkout flow", stack: ["React", "TypeScript"], status: "doing", progress: 45, due: "2026-11-06", issue: "Design specs for mobile still changing.", obstacles: "" },
    { id: "t4", memberId: "m2", title: "Accessibility audit fixes", stack: ["React", "axe"], status: "review", progress: 90, due: "2026-10-16", issue: "", obstacles: "" },
    { id: "t5", memberId: "m3", title: "Move staging cluster to EKS 1.31", stack: ["Kubernetes", "Terraform", "AWS"], status: "blocked", progress: 20, due: "2026-10-23", issue: "Helm chart incompatibility with ingress controller.", obstacles: "Waiting on security team to approve new IAM roles." },
    { id: "t6", memberId: "m4", title: "Rebuild revenue dashboard pipeline", stack: ["Airflow", "dbt", "Snowflake"], status: "doing", progress: 60, due: "2026-10-28", issue: "Source table has duplicate order IDs.", obstacles: "" },
    { id: "t7", memberId: "m5", title: "E2E test suite for checkout", stack: ["Playwright", "GitHub Actions"], status: "todo", progress: 10, due: "2026-11-13", issue: "", obstacles: "Depends on Priya's checkout redesign." },
  ],
  meetings: [
    { id: "mt1", memberId: "m1", date: "2026-10-05", time: "10:00", duration: 30, discussed: "gRPC migration status, load test results.", update: "Retry policy shipped. gRPC endpoints at 70%.", blockers: "Latency spikes at 2k rps.", actions: "Alex: profile connection pooling by Fri.\nSupervisor: ask SRE for load-test env time.", supNotes: "Strong week. Consider Alex to lead the next design review." },
    { id: "mt2", memberId: "m3", date: "2026-10-07", time: "11:00", duration: 30, discussed: "EKS upgrade blocked.", update: "Terraform modules ready.", blockers: "IAM approval pending with security.", actions: "Supervisor: escalate IAM request to security lead.", supNotes: "Follow up Thursday. Sam seemed frustrated by the wait." },
  ],
  reviews: [
    { id: "rv1", memberId: "m1", year: 2025, status: "final", ratings: { technical: 5, delivery: 4, communication: 4, collaboration: 4, initiative: 5 }, achievements: "Led event-sourcing rollout; cut p99 latency 40%.", strengths: "Deep systems knowledge, mentors juniors.", growth: "Write design docs earlier.", goals: "Lead payments platform roadmap.", overall: "Exceeds expectations", supComments: "Ready for staff-level scope.", empComments: "" },
  ],
};

const current = await (await fetch(`${api}/data`)).json();
if (current.members?.length) {
  console.log(`Skipped: the team already has ${current.members.length} people.`);
  process.exit(0);
}
for (const [collection, rows] of Object.entries(EXAMPLE)) {
  for (const { id, ...body } of rows) {
    const r = await fetch(`${api}/${collection}/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${collection}/${id}: ${r.status} ${await r.text()}`);
  }
  console.log(`Seeded ${rows.length} ${collection}`);
}
