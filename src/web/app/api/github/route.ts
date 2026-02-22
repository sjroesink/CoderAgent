import { NextResponse } from "next/server";
import { getGitHubService } from "../../../lib/server-context";

/** GET /api/github — returns auth status */
export async function GET() {
  const github = getGitHubService();
  const status = await github.getAuthStatus();
  return NextResponse.json(status);
}
