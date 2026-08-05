#!/usr/bin/env node
/**
 * Seed Linear project "SlaveDock — V1 Public Launch" on team RON.
 *
 * Usage:
 *   export LINEAR_API_KEY="lin_api_..."
 *   node scripts/linear-seed-slavedock.mjs
 *
 * Create a key: Linear → Settings → Account → Security & access → Personal API keys
 * https://linear.app/rbakman/settings/account/security
 */

const API = 'https://api.linear.app/graphql';
const KEY = process.env.LINEAR_API_KEY || process.env.LINEAR_API_TOKEN;

if (!KEY) {
  console.error('Set LINEAR_API_KEY (personal API key from Linear settings).');
  process.exit(1);
}

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: KEY,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(JSON.stringify(json.errors, null, 2));
  }
  return json.data;
}

const PROJECT_DESC = `SlaveDock — folders of apps, files, folders, and URLs on Mac Dock & Windows tray.

Free forever core · Pro one-time unlock · Coffee tips optional.

- Repo: https://github.com/rbakman-rgb/slavedock
- Site: https://rbakman-rgb.github.io/slavedock/
- Pricing: https://rbakman-rgb.github.io/slavedock/pricing.html
- Local: ~/Developer/SlaveDock

Sources of truth: Linear (backlog) · GitHub (code) · docs/SHIP.md (ship ops)

Constraints: no Dock replacement; free core stays usable; notarization/signing still open.`;

const MILESTONES = [
  { name: 'G0 — Foundation', description: 'Repo, site, Free/Pro, CI, updates' },
  { name: 'G1 — Install trust', description: 'Notarization, signing, clean-machine smoke' },
  { name: 'G2 — Pro commerce', description: 'Checkout + license delivery' },
  { name: 'G3 — Product polish', description: 'Screenshots, FAQ, support' },
  { name: 'G4 — Growth', description: 'Soft launch, optional Homebrew/rebrand' },
];

// [title, description, milestoneName, priority (0=none,1=urgent,2=high,3=medium,4=low), done]
const ISSUES = [
  ['G0-01 Native Mac launcher Free core', 'Swift Dock launcher shipped. ~/Developer/SlaveDock', 'G0 — Foundation', 2, true],
  ['G0-02 Windows Electron tray Free core', 'Tray + Ctrl+Shift+D. windows/', 'G0 — Foundation', 2, true],
  ['G0-03 Free/Pro entitlements + license keys', 'FeatureGate + Settings Pro. docs/PRICING.md', 'G0 — Foundation', 2, true],
  ['G0-04 Marketing site GitHub Pages', 'https://rbakman-rgb.github.io/slavedock/', 'G0 — Foundation', 2, true],
  ['G0-05 Release CI Mac zip + Windows exe', '.github/workflows/release.yml', 'G0 — Foundation', 2, true],
  ['G0-06 App update checks Mac + Windows', 'docs/UPDATES.md', 'G0 — Foundation', 3, true],
  ['G0-07 Public GitHub + release assets', 'github.com/rbakman-rgb/slavedock/releases', 'G0 — Foundation', 2, true],
  ['G1-01 Enroll Apple Developer Program', '$99 — needed for notarization', 'G1 — Install trust', 1, false],
  ['G1-02 Developer ID Application cert + signed Mac build', 'Sign release zip for distribution', 'G1 — Install trust', 1, false],
  ['G1-03 Notarize Mac release zip', 'Gatekeeper-clean install for strangers', 'G1 — Install trust', 1, false],
  ['G1-04 Windows code signing or document SmartScreen', 'Reduce SmartScreen friction', 'G1 — Install trust', 2, false],
  ['G1-05 Clean-machine install smoke from Releases', 'Mac + Windows from public zip/exe', 'G1 — Install trust', 1, false],
  ['G2-01 Choose merchant Lemon Squeezy / Gumroad / Paddle', 'One-time Pro $14.99 + Multi $29', 'G2 — Pro commerce', 1, false],
  ['G2-02 Create Pro products in store', 'Pro + Pro Multi SKUs', 'G2 — Pro commerce', 1, false],
  ['G2-03 Auto-email license key on purchase', 'Use scripts/generate-license.swift format', 'G2 — Pro commerce', 1, false],
  ['G2-04 Wire site Unlock Pro to checkout URL', 'website/pricing.html', 'G2 — Pro commerce', 1, false],
  ['G2-05 Optional webhook key generation', 'Stretch', 'G2 — Pro commerce', 4, false],
  ['G3-01 Homepage screenshots / launcher GIF', 'website/index.html', 'G3 — Product polish', 2, false],
  ['G3-02 Install FAQ Gatekeeper + SmartScreen', 'Site + README', 'G3 — Product polish', 2, false],
  ['G3-03 Support contact / Issues link on site', 'GitHub Issues or email', 'G3 — Product polish', 3, false],
  ['G3-04 Direct asset download links on site', 'Optional polish', 'G3 — Product polish', 4, false],
  ['G3-05 Terms of use for Pro license', 'Legal light', 'G3 — Product polish', 4, false],
  ['G4-01 Soft launch posts macapps windowsapps', 'After G1 smoke', 'G4 — Growth', 2, false],
  ['G4-02 Rebrand decision SlaveDock vs Dockpack/Stackly', 'Before heavy marketing', 'G4 — Growth', 3, false],
  ['G4-03 Homebrew cask after notarization', 'Requires G1-03', 'G4 — Growth', 4, false],
  ['G4-04 iCloud/OneDrive sync Pro pillar', 'Backlog', 'G4 — Growth', 4, false],
];

async function main() {
  const teams = await gql(`query { teams { nodes { id name key } } }`);
  const team =
    teams.teams.nodes.find((t) => t.key === 'RON' || /ron/i.test(t.name)) ||
    teams.teams.nodes[0];
  if (!team) throw new Error('No teams found');
  console.log('Team:', team.name, team.key, team.id);

  // Existing project?
  const projects = await gql(
    `query($f: ProjectFilter) { projects(filter: $f) { nodes { id name url } } }`,
    { f: { name: { containsIgnoreCase: 'SlaveDock' } } }
  );
  let project = projects.projects.nodes[0];

  if (!project) {
    const created = await gql(
      `mutation($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          success
          project { id name url }
        }
      }`,
      {
        input: {
          name: 'SlaveDock — V1 Public Launch',
          description: PROJECT_DESC,
          teamIds: [team.id],
        },
      }
    );
    if (!created.projectCreate.success) throw new Error('projectCreate failed');
    project = created.projectCreate.project;
    console.log('Created project:', project.url);
  } else {
    console.log('Using existing project:', project.url);
  }

  // Milestones
  const msMap = {};
  const existingMs = await gql(
    `query($id: String!) {
      project(id: $id) {
        projectMilestones { nodes { id name } }
      }
    }`,
    { id: project.id }
  );
  for (const m of existingMs.project.projectMilestones.nodes) {
    msMap[m.name] = m.id;
  }
  for (const m of MILESTONES) {
    if (msMap[m.name]) continue;
    const r = await gql(
      `mutation($input: ProjectMilestoneCreateInput!) {
        projectMilestoneCreate(input: $input) {
          success
          projectMilestone { id name }
        }
      }`,
      {
        input: {
          projectId: project.id,
          name: m.name,
          description: m.description,
        },
      }
    );
    if (r.projectMilestoneCreate.success) {
      msMap[m.name] = r.projectMilestoneCreate.projectMilestone.id;
      console.log('Milestone:', m.name);
    }
  }

  // Workflow states for Done
  const states = await gql(
    `query($id: String!) {
      team(id: $id) {
        states { nodes { id name type } }
      }
    }`,
    { id: team.id }
  );
  const doneState = states.team.states.nodes.find((s) => s.type === 'completed');
  const backlogState = states.team.states.nodes.find((s) => s.type === 'backlog' || s.type === 'unstarted');

  let created = 0;
  for (const [title, description, milestoneName, priority, done] of ISSUES) {
    const input = {
      teamId: team.id,
      projectId: project.id,
      title,
      description,
      priority,
    };
    if (msMap[milestoneName]) input.projectMilestoneId = msMap[milestoneName];
    if (done && doneState) input.stateId = doneState.id;
    else if (backlogState) input.stateId = backlogState.id;

    const r = await gql(
      `mutation($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier url }
        }
      }`,
      { input }
    );
    if (r.issueCreate.success) {
      created += 1;
      console.log(r.issueCreate.issue.identifier, r.issueCreate.issue.url);
    }
  }

  console.log(`\nDone. Project: ${project.url}\nIssues created this run: ${created}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
