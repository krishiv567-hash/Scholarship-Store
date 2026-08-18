const FILES = {
  pending: "pending_scholarships.json",
  published: "published_scholarships.json",
  rejected: "rejected_scholarships.json"
};

const ghHeaders = token => ({
  "Authorization": `Bearer ${token}`,
  "Accept": "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json"
});

async function getFile(owner, repo, path, branch, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const r = await fetch(url, { headers: ghHeaders(token) });
  if (!r.ok) throw new Error(`GitHub read failed for ${path}: ${r.status}`);
  const data = await r.json();
  const content = Buffer.from((data.content || "").replace(/\n/g, ""), "base64").toString("utf8");
  return { sha: data.sha, json: JSON.parse(content || "[]") };
}

async function putFile(owner, repo, path, branch, token, sha, json, message) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body = {
    message,
    content: Buffer.from(JSON.stringify(json, null, 2) + "\n", "utf8").toString("base64"),
    branch,
    sha
  };
  const r = await fetch(url, { method: "PUT", headers: ghHeaders(token), body: JSON.stringify(body) });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`GitHub write failed for ${path}: ${r.status} ${txt.slice(0,180)}`);
  }
  return r.json();
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "POST only" }) };
  }

  const { ADMIN_PASSWORD, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH = "main" } = process.env;
  if (!ADMIN_PASSWORD || !GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return {
      statusCode: 503,
      body: JSON.stringify({ error: "Review backend is not configured in Netlify yet." })
    };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  if (body.password !== ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: "Incorrect admin password." }) };
  }

  const action = body.action;
  const id = Number(body.id);
  if (!["publish", "reject"].includes(action) || !Number.isFinite(id)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid action or scholarship ID." }) };
  }

  try {
    const pendingFile = await getFile(GITHUB_OWNER, GITHUB_REPO, FILES.pending, GITHUB_BRANCH, GITHUB_TOKEN);
    const targetKey = action === "publish" ? "published" : "rejected";
    const targetFile = await getFile(GITHUB_OWNER, GITHUB_REPO, FILES[targetKey], GITHUB_BRANCH, GITHUB_TOKEN);

    const idx = pendingFile.json.findIndex(x => Number(x.id) === id);
    if (idx < 0) {
      return { statusCode: 404, body: JSON.stringify({ error: "Scholarship is no longer in the pending queue." }) };
    }

    const [item] = pendingFile.json.splice(idx, 1);
    const target = targetFile.json.filter(x => Number(x.id) !== id);
    target.push({
      ...item,
      reviewStatus: action === "publish" ? "Published" : "Rejected",
      reviewedAt: new Date().toISOString()
    });

    // Two GitHub commits. Netlify's Git integration will deploy the final state.
    await putFile(
      GITHUB_OWNER, GITHUB_REPO, FILES.pending, GITHUB_BRANCH, GITHUB_TOKEN,
      pendingFile.sha, pendingFile.json, `${action === "publish" ? "Publish" : "Reject"} scholarship: ${item.name}`
    );

    // Re-read target SHA in case the first commit moved branch state.
    const freshTarget = await getFile(GITHUB_OWNER, GITHUB_REPO, FILES[targetKey], GITHUB_BRANCH, GITHUB_TOKEN);
    const mergedTarget = freshTarget.json.filter(x => Number(x.id) !== id);
    mergedTarget.push({
      ...item,
      reviewStatus: action === "publish" ? "Published" : "Rejected",
      reviewedAt: new Date().toISOString()
    });
    await putFile(
      GITHUB_OWNER, GITHUB_REPO, FILES[targetKey], GITHUB_BRANCH, GITHUB_TOKEN,
      freshTarget.sha, mergedTarget, `${action === "publish" ? "Add published" : "Archive rejected"} scholarship: ${item.name}`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: action === "publish"
          ? "Published. GitHub was updated and Netlify will redeploy the site automatically."
          : "Rejected and moved to the audit archive."
      })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Unexpected server error" }) };
  }
};
