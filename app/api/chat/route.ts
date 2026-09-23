import { NextResponse } from "next/server";
import { orchestrate } from "@/lib/orchestrator";
import { createConversation, appendMessage, touchConversation } from "@/lib/db/repositories";
import { explainQueryFor } from "@/lib/agents/approach";
import { callTool, userInputArgument } from "@/lib/kernel/tools/execute";
import { agentsFor } from "@/lib/kernel/agents";
import { describeResult } from "@/lib/agents/describe";
import { describeApproach } from "@/lib/agents/approach";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One turn of a conversation.
 *
 * The conversation is created on the first message and identified by id
 * thereafter. Both the question and the answer are persisted, and the answer
 * carries everything needed to redraw it later: the tool results with their
 * facts and traces, the routing decision, the agent steps, the guard verdict
 * and the suggestions. That is what makes a conversation resumable rather than
 * merely logged.
 *
 * Persistence never blocks an answer. If the database is unreachable the reply
 * is still returned and the conversation simply lives in the browser for that
 * session.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const profileId = String(body.profileId ?? "PRIYA-001");

    /**
     * "Explain this" is not a new question. It asks the Tutor for the ideas
     * behind an answer that already exists, seeded from the tools that
     * produced it, and it is not persisted as a turn of the conversation.
     */
    const explainTools: string[] = Array.isArray(body.explainTools) ? body.explainTools : [];
    const isExplain = explainTools.length > 0;

    const message = isExplain
      ? `Explain in plain language, for someone with no background: ${explainQueryFor(explainTools)}.`
      : String(body.message ?? "").slice(0, 2000).trim();
    let conversationId: string | null = body.conversationId ? String(body.conversationId) : null;

    if (!message) return NextResponse.json({ error: "Empty message" }, { status: 400 });

    /**
     * A form coming back.
     *
     * The tool asked for something it could not know, the user supplied it,
     * and the tool is now called again with those values. Routing is skipped
     * because the tool is already known, but the call still goes through
     * callTool, so the permission check runs and a row is written to the audit
     * log exactly as it would for any other call.
     */
    if (body.resumeTool) {
      const tool = String(body.resumeTool);
      const agent = agentsFor(tool)[0];
      if (!agent) return NextResponse.json({ error: `No agent may call ${tool}` }, { status: 400 });

      // Each tool names its own form argument: form16 for a return, invoice
      // for an invoice. Sending everything as form16 made the invoice form
      // reappear on submit instead of producing an invoice.
      const argName = userInputArgument(tool);
      if (!argName) return NextResponse.json({ error: `${tool} does not take a form` }, { status: 400 });

      const r = await callTool({
        agent, tool,
        args: { [argName]: body.values ?? {} },
        ctx: { profileId },
      });

      const text = describeResult([r]);
      const results = [{
        tool: r.tool, component: r.component, facts: r.facts,
        data: r.data, trace: r.trace, durationMs: r.durationMs,
      }];

      if (conversationId) {
        await appendMessage({
          conversationId, profileId, role: "assistant", content: text,
          agent, provider: "deterministic",
          mode: "interactive", component: r.component,
          payload: { results, route: null, steps: [], guard: { ok: true, offending: [] },
                     suggestions: [], approach: "You filled in the form, so the calculation ran on exactly the figures you gave." },
        });
        await touchConversation(conversationId);
      }

      return NextResponse.json({
        conversationId, agent, provider: "deterministic",
        text, component: r.component, results,
        approach: "You filled in the form, so the calculation ran on exactly the figures you gave.",
        route: null, steps: [], guard: { ok: true, offending: [] },
        suggestions: [], suggestionSource: "fixed",
      });
    }

    if (isExplain) {
      const r = await orchestrate({ message, profileId, forceAgent: "tutor" });
      return NextResponse.json({
        explain: true,
        agent: r.answer.agent,
        provider: r.answer.provider,
        text: r.answer.text,
        component: r.answer.component,
        results: r.answer.toolResults.map((t) => ({
          tool: t.tool, component: t.component, facts: t.facts,
          data: t.data, trace: t.trace, durationMs: t.durationMs,
        })),
      });
    }

    let conversationTitle: string | null = null;
    if (!conversationId) {
      const c = await createConversation(profileId, message);
      if (c) { conversationId = c.id; conversationTitle = c.title; }
    }

    if (conversationId) {
      await appendMessage({ conversationId, profileId, role: "user", content: message });
    }

    const r = await orchestrate({ message, profileId });

    const results = r.answer.toolResults.map((t) => ({
      tool: t.tool, component: t.component, facts: t.facts,
      data: t.data, trace: t.trace, durationMs: t.durationMs,
    }));

    const payload = {
      approach: describeApproach(r.route, r.answer.toolResults),
      results,
      route: r.route,
      steps: r.answer.steps,
      guard: r.answer.guard,
      degraded: r.answer.degraded,
      suggestions: r.answer.suggestions,
      suggestionSource: r.answer.suggestionSource,
      totalMs: r.totalMs,
    };

    if (conversationId) {
      await appendMessage({
        conversationId, profileId, role: "assistant",
        content: r.answer.text,
        agent: r.answer.agent,
        provider: r.answer.provider,
        mode: r.answer.component !== "none" ? "interactive" : "text",
        component: r.answer.component,
        payload,
      });
      await touchConversation(conversationId);
    }

    return NextResponse.json({
      conversationId,
      conversationTitle,
      agent: r.answer.agent,
      provider: r.answer.provider,
      text: r.answer.text,
      component: r.answer.component,
      ...payload,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
  }
}
