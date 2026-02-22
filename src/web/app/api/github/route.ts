import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import { getGitHubService, setSetting, deleteSetting, refreshGitHubService } from "../../../lib/server-context";

/** GET /api/github — returns auth status */
export async function GET() {
  const github = getGitHubService();
  const status = await github.getAuthStatus();
  return NextResponse.json(status);
}

/** POST /api/github — connect with a Personal Access Token */
export async function POST(request: Request) {
  const { token } = await request.json();

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }

  // Validate the token by calling the GitHub API
  try {
    const octokit = new Octokit({ auth: token.trim() });
    const { data } = await octokit.rest.users.getAuthenticated();

    // Token is valid — persist it and refresh the service singleton
    setSetting("github_token", token.trim());
    refreshGitHubService();

    return NextResponse.json({
      authenticated: true,
      username: data.login,
      avatarUrl: data.avatar_url,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Invalid token. Make sure your PAT has the required scopes (repo)." },
      { status: 401 },
    );
  }
}

/** DELETE /api/github — disconnect (remove token) */
export async function DELETE() {
  deleteSetting("github_token");
  refreshGitHubService();
  return NextResponse.json({ authenticated: false });
}
