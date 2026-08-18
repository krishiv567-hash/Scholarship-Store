# RISE Scholarship Website v4 — Human Review Workflow

This version implements the workflow:

auto-discovery → Pending Review → Publish / Reject → live student website

## Data files

- `scholarships.json` — legacy curated scholarship database (100 records)
- `pending_scholarships.json` — automatically discovered candidates awaiting RISE review
- `published_scholarships.json` — approved auto-sourced scholarships shown to students
- `rejected_scholarships.json` — rejected candidates retained as an audit trail

The student-facing website loads `scholarships.json` + `published_scholarships.json`.

## Admin Review Queue

The existing hidden Admin tab now contains a Scholarship Review Queue. Each candidate shows:
- source/status
- award
- majors
- class years
- GPA
- location
- why the system flagged it as relevant
- the original source page

An administrator can press:
- **Publish** — move it into `published_scholarships.json`
- **Reject** — move it into `rejected_scholarships.json`

## Why GitHub + Netlify

The Publish/Reject buttons call a Netlify Function. The function writes the decision back to the GitHub repository. Netlify then sees the Git commit and automatically redeploys the site.

That means Erin does not edit HTML or JSON manually.

## Required Netlify environment variables

After this project is connected to GitHub, add these in Netlify:

- `ADMIN_PASSWORD` — the admin password you want RISE to use
- `GITHUB_TOKEN` — a GitHub fine-grained token with Contents read/write access to this repository
- `GITHUB_OWNER` — GitHub username or organization
- `GITHUB_REPO` — repository name
- `GITHUB_BRANCH` — normally `main` (optional; defaults to `main`)

Do NOT put the GitHub token into `index.html`.

## Current seeded queue

Three review candidates are included so the workflow can be demonstrated:
1. ORIX USA Scholars Program — strong JSOM/Texas fit; source currently says Closed
2. CLA Foundation Opportunity Scholarship — strong business/finance/data fit; source currently says Closed
3. Jindal School Undergraduate Scholarships — official JSOM source; current cycle should be reviewed before publishing

These are examples of why human review is valuable: automatic discovery can identify relevance, but a RISE admin confirms whether it belongs on the live site.
