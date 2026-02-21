import { NextResponse } from "next/server";
import { getGitHubService } from "../../../../../../../lib/server-context";

/** GET /api/github/repos/:owner/:repo/branches — list branches */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  const github = getGitHubService();

  try {
    const branches = await github.listBranches(`${owner}/${repo}`);
    return NextResponse.json(branches);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
