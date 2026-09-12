import { commentMentionsPr, isDoneState } from "./ship";
import type { Tracer } from "./trace";
import type { Plan, Verification } from "./types";
import type { Apps } from "./apps/types";

export class Verifier {
  constructor(private apps: Apps) {}

  async check(
    planned: Plan,
    sinceUnix: number,
    tracer: Tracer,
  ): Promise<Verification> {
    const missing: string[] = [];
    if (!planned.issue || !planned.email) {
      return {
        linearDone: false,
        commentHasPrUrl: false,
        gmailSentId: null,
        missing: ["linear", "gmail"],
      };
    }

    tracer.push({ type: "status", note: "verifying", agent: "verifier" });

    const issue = await tracer.call(
      "linear.getIssue",
      { id: planned.issue.id },
      () => this.apps.linear.getIssue(planned.issue!.id),
      "verifier",
    );
    const comments = await tracer.call(
      "linear.listComments",
      { id: planned.issue.id },
      () => this.apps.linear.listComments(planned.issue!.id),
      "verifier",
    );
    const linearDone = isDoneState(issue.state);
    const commentHasPrUrl = commentMentionsPr(comments, planned.pr.url);
    if (!linearDone) missing.push("linear.state");
    if (!commentHasPrUrl) missing.push("linear.comment");

    const sent = await tracer.call(
      "gmail.findSent",
      {
        to: planned.email.to,
        subject: planned.email.subject,
        sinceUnix,
      },
      () =>
        this.apps.gmail.findSent({
          to: planned.email!.to,
          subject: planned.email!.subject,
          sinceUnix,
        }),
      "verifier",
    );
    if (!sent) missing.push("gmail");

    const verification: Verification = {
      linearDone,
      commentHasPrUrl,
      gmailSentId: sent?.id ?? null,
      missing,
    };
    tracer.push({
      type: "verify",
      response: verification,
      ok: missing.length === 0,
      agent: "verifier",
    });
    return verification;
  }
}

export function verifyPlan(
  apps: Apps,
  planned: Plan,
  sinceUnix: number,
  tracer: Tracer,
): Promise<Verification> {
  return new Verifier(apps).check(planned, sinceUnix, tracer);
}
