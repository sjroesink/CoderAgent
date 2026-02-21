import { NextResponse } from "next/server";
import { getGitHubService } from "../../../../lib/server-context";

/** GET /api/github/repos?q=search — list or search repos */
export async function GET(request: Request) {
  const github = getGitHubService();
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  try {
    const repos = query
      ? await github.searchRepos(query)
      : await github.listRepos();
    return NextResponse.json(repos);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
