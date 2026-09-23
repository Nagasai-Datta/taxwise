import { z } from "zod";
import type { ToolSpec } from "./types";
import { computeTax } from "../tax";
import { compareRegimes } from "../regimes";
import { optimizeDeductions } from "../optimize";
import { computeHRAExemption } from "../hra";
import { computeGST, presumptiveVsBooks, computeAdvanceTax, compute194J, getApplicableDeadlines } from "../business";
import { computeNetWorth, categorizeSpending, computeSavingsRate, computeGoalProgress } from "../management";
import { deductionCatalogue, RULES } from "../rules";
import { groupedFor, guidedStartFor } from "../capabilities";
import { prepareITR, prefillFrom, type Form16 } from "../itr";
import { propagateGraph, invertGraph, NODES, LEVERS, type NodeId } from "../graph";
import { compareInvestments, buildInvoice, invoiceDefaults, type InvoiceInput } from "../advisory";
import { toTaxInput } from "../profiles";
import { findProfile, listAccounts, listTransactions, listGoals } from "@/lib/db/repositories";

/**
 * 4B, the tool registry: the only doorway from an agent into the kernel.
 *
 * Note what the argument schemas do NOT contain. No tool accepts an income, a
 * balance or any other rupee amount from the caller. Every figure is loaded
 * from the profile inside the tool. If a model could pass an income, it could
 * fabricate one, and the governing rule would be broken at the first step.
 *
 * The most a model may supply is a choice: which regime, which section, how
 * much to hypothetically invest.
 */

async function loadProfile(profileId: string) {
  const p = await findProfile(profileId);
  if (!p) throw new Error(`Unknown profile: ${profileId}`);
  return p;
}

const Empty = z.object({});

export const TOOLS: Record<string, ToolSpec> = {
  /* ------------------------------------------------------------ shared */
  get_profile_summary: {
    name: "get_profile_summary",
    description: "Read the user's own details: occupation, city, income, rent and the deductions already claimed. Call this first when you need to know anything about who you are talking to.",
    inputSchema: Empty,
    component: "profile_summary",
    async run(_a, ctx) {
      const p = await loadProfile(ctx.profileId);
      return {
        data: p,
        facts: {
          name: p.name,
          occupation: p.occupation,
          city: p.city,
          grossAnnualIncome: p.income.grossAnnual,
          monthlyRent: p.rentMonthly,
        },
        trace: null,
      };
    },
  },

  list_capabilities: {
    name: "list_capabilities",
    description: "List everything this particular user can ask about, grouped and written in plain language. Call this when the user asks what they can do, what the system can help with, or says they do not know where to start.",
    inputSchema: z.object({
      guided: z.boolean().optional().describe("True when the user does not know where to start, which shows a shorter opening set."),
    }),
    component: "capabilities",
    async run(a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const groups = groupedFor(p.occupation);
      return {
        data: { occupation: p.occupation, name: p.name, groups, guided: a.guided === true,
                openers: a.guided === true ? guidedStartFor(p.occupation) : [] },
        facts: {
          groupCount: groups.length,
          capabilityCount: groups.reduce((n, g) => n + g.items.length, 0),
        },
        trace: null,
      };
    },
  },

  get_deadlines: {
    name: "get_deadlines",
    description: "List the statutory deadlines that apply to this user, based on their occupation and whether they are registered for GST.",
    inputSchema: z.object({
      gstRegistered: z.boolean().optional().describe("Whether the user is registered for GST. Defaults to false."),
    }),
    component: "deadline_timeline",
    async run(a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const events = getApplicableDeadlines({ occupation: p.occupation, gstRegistered: a.gstRegistered ?? false });
      return { data: events, facts: { deadlineCount: events.length }, trace: null };
    },
  },

  /* -------------------------------------------------------- computation */
  compute_tax: {
    name: "compute_tax",
    description: "Compute the user's total income tax under one regime, with a full step by step derivation. Use when the user asks what they owe or why the amount is what it is.",
    inputSchema: z.object({
      regime: z.enum(["new", "old"]).describe("Which regime to compute under."),
    }),
    component: "tax_breakdown",
    async run(a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const r = computeTax({ ...toTaxInput(p), regime: a.regime });
      return {
        data: r,
        facts: {
          regime: r.regimeLabel,
          grossIncome: r.grossIncome,
          standardDeduction: r.standardDeduction,
          hraExemption: r.hraExemption,
          chapterVIA: r.chapterVIA,
          taxableIncome: r.taxableIncome,
          taxBeforeRebate: r.taxBeforeRebate,
          rebate87A: r.rebate87A,
          cess: r.cess,
          totalTax: r.totalTax,
        },
        trace: r.trace,
      };
    },
  },

  compare_regimes: {
    name: "compare_regimes",
    description: "Compute the tax under both the old and the new regime and recommend the cheaper one. Use when the user asks which regime to choose.",
    inputSchema: Empty,
    component: "regime_comparison",
    async run(_a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const c = compareRegimes(toTaxInput(p));
      return {
        data: c,
        facts: {
          newRegimeTax: c.newRegime.totalTax,
          oldRegimeTax: c.oldRegime.totalTax,
          newRegimeTaxableIncome: c.newRegime.taxableIncome,
          oldRegimeTaxableIncome: c.oldRegime.taxableIncome,
          recommended: c.recommended === "new" ? "New Regime" : "Old Regime",
          saving: c.saving,
        },
        trace: c[c.recommended === "new" ? "newRegime" : "oldRegime"].trace,
      };
    },
  },

  compute_hra_exemption: {
    name: "compute_hra_exemption",
    description: "Work out the house rent allowance exemption, showing all three candidate amounts and which one was lowest. Only meaningful for salaried users under the old regime.",
    inputSchema: Empty,
    component: "hra_breakdown",
    async run(_a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const basic = p.income.basicAnnual ?? 0;
      const hraReceived = p.income.hraReceivedAnnual ?? 0;
      if (!basic || !hraReceived) {
        return {
          data: { applicable: false, reason: "This user does not draw a salary with an HRA component, so no HRA exemption arises." },
          facts: { applicable: "no" } as Record<string, number | string>,
          trace: null,
        };
      }
      const h = computeHRAExemption({
        basicAnnual: basic, hraReceivedAnnual: hraReceived,
        rentAnnual: p.rentMonthly * 12, isMetro: p.isMetro,
      });
      return {
        data: { applicable: true, ...h },
        facts: {
          exemption: h.exemption,
          actualHRAReceived: h.candidates[0].value,
          shareOfBasic: h.candidates[1].value,
          rentMinusTenPercent: h.candidates[2].value,
        },
        trace: h.trace,
      };
    },
  },

  optimize_deductions: {
    name: "optimize_deductions",
    description: "Find every deduction the user has not fully used and compute the exact rupee tax saving from filling each one. Use when the user asks how to pay less tax.",
    inputSchema: Empty,
    component: "deduction_optimizer",
    async run(_a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const o = optimizeDeductions(toTaxInput(p));
      const facts: Record<string, number | string> = {
        baselineTax: o.baselineTax,
        bestPossibleTax: o.bestPossibleTax,
        totalPotentialSaving: o.totalPotentialSaving,
        opportunityCount: o.opportunities.length,
      };
      o.opportunities.slice(0, 4).forEach((x, i) => {
        facts[`option${i + 1}Section`] = x.section;
        facts[`option${i + 1}Headroom`] = x.headroom;
        facts[`option${i + 1}Saving`] = x.taxSavedIfFilled;
      });
      return { data: o, facts, trace: null };
    },
  },

  what_if_deduction: {
    name: "what_if_deduction",
    description: "Show what the user's tax would become if they invested a specific amount under a specific deduction section. Use when the user asks what happens if they invest a particular sum.",
    inputSchema: z.object({
      section: z.enum(["80C", "80D", "80CCD1B", "24b", "80TTA"]).describe("Which deduction section."),
      amount: z.number().int().min(0).max(10000000).describe("The total amount claimed under that section, in rupees."),
    }),
    component: "what_if_diff",
    async run(a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const base = toTaxInput(p);
      const before = computeTax({ ...base, regime: "old" });
      const after = computeTax({
        ...base, regime: "old",
        deductions: { ...(base.deductions ?? {}), [a.section]: a.amount },
      });
      return {
        data: { section: a.section, amount: a.amount, before, after, difference: before.totalTax - after.totalTax },
        facts: {
          section: a.section,
          amountClaimed: a.amount,
          taxBefore: before.totalTax,
          taxAfter: after.totalTax,
          saving: before.totalTax - after.totalTax,
        },
        trace: after.trace,
      };
    },
  },

  compute_gst: {
    name: "compute_gst",
    description: "Compute goods and services tax: what the user charged customers, the credit for GST paid on business expenses, and the net amount payable. Also reports whether registration is required.",
    inputSchema: Empty,
    component: "gst_summary",
    async run(_a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const turnover = p.income.turnoverAnnual ?? p.income.grossReceiptsAnnual ?? 0;
      const g = computeGST({
        domesticTurnover: p.income.domesticReceipts ?? turnover,
        exportTurnover: p.income.exportReceipts ?? 0,
        gstPaidOnExpenses: p.income.gstOnExpensesPaid ?? 0,
      });
      return {
        data: g,
        facts: {
          outputGST: g.outputGST,
          inputTaxCredit: g.inputTaxCredit,
          netGSTPayable: g.netGSTPayable,
          registrationRequired: g.registrationRequired ? "yes" : "no",
          registrationThreshold: g.registrationThreshold,
          headroomToThreshold: g.headroomToThreshold,
        },
        trace: g.trace,
      };
    },
  },

  presumptive_vs_books: {
    name: "presumptive_vs_books",
    description: "Compare declaring profit under a presumptive scheme, section 44AD for a business or 44ADA for a professional, against keeping regular books of account. Reports which produces the lower declared profit and the conditions attached.",
    inputSchema: Empty,
    component: "presumptive_comparison",
    async run(_a, ctx) {
      const p = await loadProfile(ctx.profileId);
      if (p.occupation === "salaried") {
        return {
          data: { applicable: false, reason: "Presumptive taxation applies to business and professional income, not to salary." },
          facts: { applicable: "no" } as Record<string, number | string>,
          trace: null,
        };
      }
      const turnover = p.income.turnoverAnnual ?? p.income.grossReceiptsAnnual ?? 0;
      const r = presumptiveVsBooks({
        occupation: p.occupation,
        turnover,
        actualExpenses: p.income.businessExpensesAnnual ?? 0,
        digitalReceiptShare: p.income.digitalReceiptShare ?? 1,
      });
      return {
        data: { applicable: true, ...r },
        facts: {
          scheme: r.options[0].scheme ?? "none",
          presumptiveProfit: r.options[0].declaredProfit,
          profitFromBooks: r.options[1].declaredProfit,
          recommended: r.recommended,
          difference: r.profitDifference,
          turnover,
        },
        trace: r.trace,
      };
    },
  },

  compute_advance_tax: {
    name: "compute_advance_tax",
    description: "Work out whether advance tax is due and produce the instalment schedule with dates and amounts.",
    inputSchema: z.object({
      underPresumptiveScheme: z.boolean().optional().describe("Whether the user is using a presumptive scheme, which changes the schedule to a single March instalment."),
    }),
    component: "advance_tax_schedule",
    async run(a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const c = compareRegimes(toTaxInput(p));
      const liability = c[c.recommended === "new" ? "newRegime" : "oldRegime"].totalTax;
      const r = computeAdvanceTax({ totalLiability: liability, underPresumptiveScheme: a.underPresumptiveScheme ?? false });
      const facts: Record<string, number | string> = {
        totalLiability: r.totalLiability,
        required: r.required ? "yes" : "no",
        minimumLiability: r.minimumLiability,
        instalmentCount: r.instalments.length,
      };
      r.instalments.forEach((i) => { facts[`due_${i.dueDate.replace(/\s/g, "_")}`] = i.cumulativeAmount; });
      return { data: r, facts, trace: r.trace };
    },
  },

  compute_194j_tds: {
    name: "compute_194j_tds",
    description: "For a professional, compute how much tax clients should have deducted at source from their fees under section 194J, and compare it against what was actually deducted.",
    inputSchema: Empty,
    component: "tds_summary",
    async run(_a, ctx) {
      const p = await loadProfile(ctx.profileId);
      if (p.occupation !== "profession") {
        return {
          data: { applicable: false, reason: "Section 194J applies to professional fees. This user does not have professional income." },
          facts: { applicable: "no" } as Record<string, number | string>,
          trace: null,
        };
      }
      // Section 194J obliges a payer in India. A client overseas deducts
      // nothing, so only domestic receipts are subject to it. Taking the rate
      // on gross receipts invented a shortfall for anyone with export income.
      const gross = p.income.grossReceiptsAnnual ?? 0;
      const receipts = p.income.domesticReceipts ?? gross;
      const t = compute194J(receipts);
      const actual = p.income.tds194JDeducted ?? 0;
      return {
        data: { applicable: true, ...t, actuallyDeducted: actual, grossReceipts: gross, domesticReceipts: receipts, shortfall: t.expectedTDS - actual },
        facts: {
          grossReceipts: gross,
          domesticReceipts: receipts,
          expectedTDS: t.expectedTDS,
          actuallyDeducted: actual,
          shortfall: t.expectedTDS - actual,
        },
        trace: null,
      };
    },
  },

  /* --------------------------------------------------------- management */
  compute_net_worth: {
    name: "compute_net_worth",
    description: "Add up the balances across every account the user has connected.",
    inputSchema: Empty,
    component: "net_worth",
    async run(_a, ctx) {
      const accs = await listAccounts(ctx.profileId);
      const n = computeNetWorth(accs.map((a) => ({
        bankName: a.bankName, maskedNumber: a.maskedNumber, balance: a.balance, accountType: a.accountType,
      })));
      return {
        data: n,
        facts: { netWorth: n.total, accountCount: n.byAccount.length },
        trace: n.trace,
      };
    },
  },

  categorize_spending: {
    name: "categorize_spending",
    description: "Group the user's outgoing transactions by category and report what they spend most on.",
    inputSchema: Empty,
    component: "spending_breakdown",
    async run(_a, ctx) {
      const accs = await listAccounts(ctx.profileId);
      const tx = (await Promise.all(accs.map((a) => listTransactions(a.id)))).flat();
      const c = categorizeSpending(tx.map((t) => ({
        amount: t.amount, direction: t.direction, merchant: t.merchant, category: t.category, occurredAt: t.occurredAt,
      })));
      const facts: Record<string, number | string> = {
        totalSpent: c.totalSpent,
        totalReceived: c.totalReceived,
        transactionCount: tx.length,
        categoryCount: c.categories.length,
      };
      c.categories.slice(0, 3).forEach((x, i) => {
        facts[`top${i + 1}Category`] = x.category;
        facts[`top${i + 1}Total`] = x.total;
      });
      return { data: c, facts, trace: c.trace };
    },
  },

  compute_savings_rate: {
    name: "compute_savings_rate",
    description: "Work out how much of the user's income is left after spending, and express it as a percentage.",
    inputSchema: Empty,
    component: "savings_rate",
    async run(_a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const accs = await listAccounts(ctx.profileId);
      const tx = (await Promise.all(accs.map((a) => listTransactions(a.id)))).flat();
      const spend = categorizeSpending(tx.map((t) => ({
        amount: t.amount, direction: t.direction, merchant: t.merchant, category: t.category, occurredAt: t.occurredAt,
      })));
      const c = compareRegimes(toTaxInput(p));
      const netIncome = p.income.grossAnnual - c[c.recommended === "new" ? "newRegime" : "oldRegime"].totalTax;
      const s = computeSavingsRate({ netIncome, totalSpent: spend.totalSpent });
      return {
        data: { ...s, netIncome, totalSpent: spend.totalSpent },
        facts: {
          netIncome,
          totalSpent: spend.totalSpent,
          saved: s.saved,
          savingsRatePercent: Math.round(s.rate * 10000) / 100,
        },
        trace: s.trace,
      };
    },
  },

  compute_goal_progress: {
    name: "compute_goal_progress",
    description: "Report how far along the user is on each savings goal, and roughly how long each will take at their current savings rate.",
    inputSchema: Empty,
    component: "goal_progress",
    async run(_a, ctx) {
      const goals = await listGoals(ctx.profileId);
      if (goals.length === 0) {
        return { data: { goals: [], empty: true }, facts: { goalCount: 0 }, trace: null };
      }
      const p = await loadProfile(ctx.profileId);
      const accs = await listAccounts(ctx.profileId);
      const tx = (await Promise.all(accs.map((a) => listTransactions(a.id)))).flat();
      const spend = categorizeSpending(tx.map((t) => ({
        amount: t.amount, direction: t.direction, merchant: t.merchant, category: t.category, occurredAt: t.occurredAt,
      })));
      const c = compareRegimes(toTaxInput(p));
      const netIncome = p.income.grossAnnual - c[c.recommended === "new" ? "newRegime" : "oldRegime"].totalTax;
      const monthly = Math.max(0, Math.round((netIncome - spend.totalSpent) / 12));
      const g = computeGoalProgress(
        goals.map((x) => ({ name: x.name, targetAmount: x.targetAmount, currentAmount: x.currentAmount, targetDate: x.targetDate })),
        monthly
      );
      const facts: Record<string, number | string> = { goalCount: g.goals.length, monthlySaving: monthly };
      g.goals.forEach((x, i) => {
        facts[`goal${i + 1}Name`] = x.name;
        facts[`goal${i + 1}Target`] = x.targetAmount;
        facts[`goal${i + 1}Current`] = x.currentAmount;
        facts[`goal${i + 1}Remaining`] = x.remaining;
      });
      return { data: g, facts, trace: g.trace };
    },
  },

  list_recent_transactions: {
    name: "list_recent_transactions",
    description: "List the user's most recent transactions across all accounts.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(50).optional().describe("How many to return. Defaults to 10."),
    }),
    component: "transaction_list",
    async run(a, ctx) {
      const accs = await listAccounts(ctx.profileId);
      const tx = (await Promise.all(accs.map((x) => listTransactions(x.id)))).flat();
      tx.sort((x, y) => new Date(y.occurredAt).getTime() - new Date(x.occurredAt).getTime());
      const out = tx.slice(0, a.limit ?? 10);
      return {
        data: out,
        facts: { returned: out.length, totalAvailable: tx.length },
        trace: null,
      };
    },
  },

  compare_investments: {
    name: "compare_investments",
    description: "Compare the places a deduction can be invested: which section each falls under, how long the money is locked, how the payout is taxed, and the exact rupee tax each would save. It does not compare returns.",
    inputSchema: Empty,
    component: "investment_comparison",
    async run(_a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const base = toTaxInput(p);
      const c = compareInvestments({
        grossIncome: base.grossIncome,
        isSalaried: base.isSalaried,
        deductions: base.deductions ?? {},
        hra: base.hra,
      });
      const best = [...c.options].filter((o) => o.eligible).sort((a, b) => b.taxSavedIfFilled - a.taxSavedIfFilled)[0];
      return {
        data: c,
        facts: {
          baselineTax: c.baselineTax,
          optionCount: c.options.length,
          withHeadroom: c.options.filter((o) => o.eligible).length,
          largestSaving: best?.taxSavedIfFilled ?? 0,
          largestSavingOption: best?.name ?? "none",
        },
        trace: null,
      };
    },
  },

  generate_invoice: {
    name: "generate_invoice",
    description: "Prepare an invoice for a client, showing the fee, any GST charged on top, the TDS the client will deduct, and what will actually arrive. Call with no arguments and a form is shown. Business and professional users only.",
    inputSchema: z.object({
      invoice: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
        .describe("The invoice details. Omit this to have the user fill them in."),
    }),
    component: "invoice",
    async run(a, ctx) {
      const p = await loadProfile(ctx.profileId);

      if (p.occupation === "salaried") {
        return {
          data: { applicable: false, reason: "An invoice is raised by someone billing a client. A salaried employee is paid through payroll instead." },
          facts: { applicable: "no" } as Record<string, number | string>,
          trace: null,
        };
      }

      if (!a.invoice) {
        const d = invoiceDefaults();
        return {
          data: null,
          facts: { status: "awaiting invoice details" } as Record<string, number | string>,
          trace: null,
          needsInput: {
            title: "Invoice details",
            description: "Nothing is sent to anyone. This produces a document you can check and download.",
            submitLabel: "Prepare the invoice",
            resumeTool: "generate_invoice",
            fields: [
              { name: "invoiceNumber", label: "Invoice number", help: "Keep the sequence unbroken. Gaps invite questions later.", type: "text", group: "Invoice", defaultValue: d.invoiceNumber },
              { name: "invoiceDate", label: "Date", type: "text", group: "Invoice", defaultValue: d.invoiceDate },
              { name: "clientName", label: "Client name", type: "text", group: "Client", required: true, defaultValue: "" },
              { name: "clientAddress", label: "Client address", type: "text", group: "Client", defaultValue: "" },
              { name: "clientGSTIN", label: "Client GSTIN", help: "Leave blank for an individual or an overseas client.", type: "text", group: "Client", defaultValue: "" },
              { name: "description", label: "What the work was", type: "text", group: "Work", required: true, defaultValue: "" },
              { name: "amount", label: "Your fee", help: "Before GST. GST is added on top, never taken out of it.", type: "number", group: "Work", defaultValue: 0 },
              { name: "isExport", label: "Client is outside India", type: "select", group: "Tax",
                options: [{ value: "no", label: "No" }, { value: "yes", label: "Yes, this is an export" }], defaultValue: "no" },
              { name: "chargeGST", label: "Charge GST", help: "Only if you are registered. Exports are zero-rated either way.", type: "select", group: "Tax",
                options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }], defaultValue: "yes" },
              { name: "placeOfSupply", label: "Place of supply", type: "text", group: "Tax", defaultValue: p.city },
              { name: "notes", label: "Notes for the client", type: "text", group: "Work", defaultValue: "" },
            ],
          },
        };
      }

      const raw = a.invoice as Record<string, string | number | boolean>;
      const str = (k: string) => String(raw[k] ?? "");
      const yes = (k: string) => String(raw[k] ?? "").toLowerCase() === "yes" || raw[k] === true;
      const input: InvoiceInput = {
        invoiceNumber: str("invoiceNumber"),
        invoiceDate: str("invoiceDate"),
        clientName: str("clientName"),
        clientAddress: str("clientAddress"),
        clientGSTIN: str("clientGSTIN"),
        description: str("description"),
        amount: Number(String(raw.amount ?? "").replace(/[,\s\u20B9]/g, "")) || 0,
        chargeGST: yes("chargeGST"),
        isExport: yes("isExport"),
        placeOfSupply: str("placeOfSupply"),
        notes: str("notes"),
      };

      const inv = buildInvoice(input, p);
      return {
        data: inv,
        facts: {
          fee: inv.subtotal,
          gst: inv.gstAmount,
          invoiceTotal: inv.total,
          tdsExpected: inv.tdsExpected,
          amountYouShouldReceive: inv.expectedReceipt,
          client: inv.header.to.name,
        },
        trace: inv.trace,
      };
    },
  },

  explore_graph: {
    name: "explore_graph",
    description: "Open the causal finance graph: every figure in the user's position and what it is computed from, with sliders to see what moves what. Use when the user asks what happens if something changes, or wants to explore their situation rather than ask one question.",
    inputSchema: z.object({
      regime: z.enum(["new", "old"]).optional().describe("Which regime to explore under. Defaults to old, where the most levers exist."),
    }),
    component: "causal_graph",
    async run(a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const regime = a.regime ?? "old";
      const accs = await listAccounts(ctx.profileId);
      const tx = (await Promise.all(accs.map((x) => listTransactions(x.id)))).flat();
      const spent = tx.filter((t) => t.direction === "debit").reduce((n, t) => n + t.amount, 0);

      const inputs: Record<string, number> = {
        grossSalary: p.income.grossAnnual,
        basicSalary: p.income.basicAnnual ?? Math.round(p.income.grossAnnual * 0.5),
        hraReceived: p.income.hraReceivedAnnual ?? 0,
        rentAnnual: p.rentMonthly * 12,
        d80C: p.deductions["80C"] ?? 0,
        d80D: p.deductions["80D"] ?? 0,
        d80CCD1B: p.deductions["80CCD1B"] ?? 0,
        d24b: p.deductions["24b"] ?? 0,
        annualSpending: spent,
        isMetro: p.isMetro ? 1 : 0,
      };

      const g = propagateGraph(inputs, regime);
      return {
        data: { inputs, regime, values: g.values, nodes: NODES, levers: LEVERS, name: p.name },
        facts: {
          regime: regime === "new" ? "New Regime" : "Old Regime",
          totalTax: g.values.totalTax,
          taxableIncome: g.values.taxableIncome,
          netIncome: g.values.netIncome,
          annualSaving: g.values.annualSaving,
          savingsRatePercent: g.values.savingsRate,
          nodeCount: NODES.length,
        },
        trace: g.trace,
      };
    },
  },

  solve_backwards: {
    name: "solve_backwards",
    description: "Work backwards from a figure the user wants. Given a target such as a total tax of 40000, and which input to move, find the input value that reaches it. Use for questions of the form 'how much would I need to invest so that my tax is X'.",
    inputSchema: z.object({
      target: z.enum(["totalTax", "taxableIncome", "netIncome", "annualSaving", "savingsRate"])
        .describe("The figure the user wants to hit."),
      targetValue: z.number().describe("The value they want it to be. A percentage for savingsRate, rupees otherwise."),
      lever: z.enum(["d80C", "d80D", "d80CCD1B", "d24b", "grossSalary", "rentAnnual", "annualSpending"])
        .optional()
        .describe("Which input to move. Omit it and a sensible one is chosen: investments for a tax target, spending for a savings target."),
      regime: z.enum(["new", "old"]).optional(),
    }),
    component: "inverse_result",
    async run(a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const regime = a.regime ?? "old";
      const accs = await listAccounts(ctx.profileId);
      const tx = (await Promise.all(accs.map((x) => listTransactions(x.id)))).flat();
      const spent = tx.filter((t) => t.direction === "debit").reduce((n, t) => n + t.amount, 0);

      const inputs: Record<string, number> = {
        grossSalary: p.income.grossAnnual,
        basicSalary: p.income.basicAnnual ?? Math.round(p.income.grossAnnual * 0.5),
        hraReceived: p.income.hraReceivedAnnual ?? 0,
        rentAnnual: p.rentMonthly * 12,
        d80C: p.deductions["80C"] ?? 0,
        d80D: p.deductions["80D"] ?? 0,
        d80CCD1B: p.deductions["80CCD1B"] ?? 0,
        d24b: p.deductions["24b"] ?? 0,
        annualSpending: spent,
        isMetro: p.isMetro ? 1 : 0,
      };

      /**
       * A user asking "how much do I need to invest so my tax is X" has named
       * the target but not the lever. Asking them which deduction to move is a
       * worse answer than picking the obvious one and saying which was picked.
       */
      const DEFAULT_LEVER: Record<string, NodeId> = {
        totalTax: "d80C", taxableIncome: "d80C", netIncome: "d80C",
        annualSaving: "annualSpending", savingsRate: "annualSpending",
      };
      const lever = (a.lever ?? DEFAULT_LEVER[a.target] ?? "d80C") as NodeId;

      const r = invertGraph({
        inputs, lever, target: a.target as NodeId,
        targetValue: a.targetValue, regime,
      });

      /**
       * When the target cannot be reached, requiredLever is the far end of the
       * range and nothing more. Publishing it invites exactly the sentence a
       * model wrote in testing: "you would need to invest 1,50,000 to bring
       * your tax to 40,000", which is false. It is withheld, and the best the
       * lever can actually manage is given instead.
       */
      const facts: Record<string, number | string> = {
        achievable: r.achievable ? "yes" : "no",
        lever: r.leverLabel,
        target: r.targetLabel,
        wantedValue: r.targetValue,
        currentLever: r.currentLever,
        currentValue: r.currentValue,
        iterations: r.iterations,
        leverChosenAutomatically: a.lever ? "no" : "yes",
        targetIsRate: a.target === "savingsRate" ? "yes" : "no",
      };
      if (r.achievable) {
        facts.requiredLever = r.requiredLever;
        facts.achievedValue = r.achievedValue;
      } else {
        facts.bestAchievable = r.achievedValue;
      }

      return {
        data: r,
        facts,
        // An unreachable target is a verdict a paraphrase can invert.
        authoritative: !r.achievable,
        trace: null,
      };
    },
  },

  prepare_itr: {
    name: "prepare_itr",
    description: "Prepare the user's income tax return from their Form 16. Call with no arguments and a form is shown for the Form 16 figures; call again with those figures and the return is prepared. Salaried users only. Nothing is submitted anywhere.",
    inputSchema: z.object({
      form16: z.record(z.union([z.string(), z.number()])).optional()
        .describe("The figures from Form 16. Omit this to have the user fill them in."),
    }),
    component: "itr_summary",
    async run(a, ctx) {
      const p = await loadProfile(ctx.profileId);

      if (p.occupation !== "salaried") {
        return {
          data: { applicable: false, reason: "A return is prepared from a Form 16, which only a salaried employee receives. Business and professional income is filed differently." },
          facts: { applicable: "no" } as Record<string, number | string>,
          trace: null,
        };
      }

      /**
       * No Form 16 figures yet. The tool cannot answer and will not guess, so
       * it asks. Values are prefilled from the profile where they are known,
       * so the user corrects rather than types from nothing.
       */
      if (!a.form16) {
        const pre = prefillFrom(p);
        return {
          data: null,
          facts: { status: "awaiting Form 16 details" } as Record<string, number | string>,
          trace: null,
          needsInput: {
            title: "Your Form 16",
            description: "These are the items on Form 16 Part B, in the order they are printed. Anything you leave at zero is treated as zero. Nothing is sent anywhere.",
            submitLabel: "Prepare my return",
            resumeTool: "prepare_itr",
            fields: [
              { name: "employerName", label: "Employer name", type: "text", group: "Part A", defaultValue: "" },
              { name: "employerTAN", label: "Employer TAN", type: "text", group: "Part A", defaultValue: "" },
              { name: "tdsDeducted", label: "Total tax deducted", help: "The total TDS from Part A, not the tax payable shown in Part B.", type: "number", group: "Part A", defaultValue: pre.tdsDeducted },

              { name: "salary17_1", label: "Salary under section 17(1)", help: "Item 1(a). Basic, allowances and bonus combined.", type: "number", group: "1. Gross salary", defaultValue: pre.salary17_1 },
              { name: "perquisites17_2", label: "Perquisites under section 17(2)", help: "Item 1(b). Usually zero unless you have a company car or accommodation.", type: "number", group: "1. Gross salary", defaultValue: 0 },
              { name: "profitsInLieu17_3", label: "Profits in lieu of salary under 17(3)", help: "Item 1(c). Usually zero.", type: "number", group: "1. Gross salary", defaultValue: 0 },

              { name: "hraExempt10_13A", label: "House rent allowance exempt", help: "Item 2(a), under section 10(13A). Zero if your employer used the new regime.", type: "number", group: "2. Exempt allowances", defaultValue: pre.hraExempt10_13A },
              { name: "otherExempt10", label: "Other exempt allowances", help: "Item 2(b), such as leave travel allowance.", type: "number", group: "2. Exempt allowances", defaultValue: 0 },

              { name: "professionalTax16_3", label: "Professional tax", help: "Item 4(c), under section 16(iii).", type: "number", group: "4. Section 16", defaultValue: 0 },

              { name: "housePropertyIncome", label: "Income from house property", help: "Item 7(a). Enter a negative number for a loss, such as home loan interest.", type: "number", group: "7. Other income", defaultValue: 0 },
              { name: "otherSourcesIncome", label: "Income from other sources", help: "Item 7(b), such as bank interest.", type: "number", group: "7. Other income", defaultValue: 0 },

              { name: "deduction80C", label: "Section 80C", type: "number", group: "10. Chapter VI-A", defaultValue: pre.deduction80C },
              { name: "deduction80D", label: "Section 80D, health insurance", type: "number", group: "10. Chapter VI-A", defaultValue: pre.deduction80D },
              { name: "deduction80CCD1B", label: "Section 80CCD(1B), pension", type: "number", group: "10. Chapter VI-A", defaultValue: pre.deduction80CCD1B },
              { name: "deduction80TTA", label: "Section 80TTA, savings interest", type: "number", group: "10. Chapter VI-A", defaultValue: pre.deduction80TTA },
            ],
          },
        };
      }

      const raw = a.form16 as Record<string, string | number>;
      const num = (k: string) => {
        const v = raw[k];
        const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[,\s\u20B9]/g, ""));
        return Number.isFinite(n) ? n : 0;
      };
      const form: Form16 = {
        employerName: String(raw.employerName ?? ""),
        employerTAN: String(raw.employerTAN ?? ""),
        assessmentYear: String(raw.assessmentYear ?? RULES._meta.assessmentYear),
        salary17_1: num("salary17_1"),
        perquisites17_2: num("perquisites17_2"),
        profitsInLieu17_3: num("profitsInLieu17_3"),
        hraExempt10_13A: num("hraExempt10_13A"),
        otherExempt10: num("otherExempt10"),
        professionalTax16_3: num("professionalTax16_3"),
        housePropertyIncome: num("housePropertyIncome"),
        otherSourcesIncome: num("otherSourcesIncome"),
        deduction80C: num("deduction80C"),
        deduction80D: num("deduction80D"),
        deduction80CCD1B: num("deduction80CCD1B"),
        deduction80TTA: num("deduction80TTA"),
        tdsDeducted: num("tdsDeducted"),
      };

      const r = prepareITR(form, p);
      return {
        data: r,
        facts: {
          regimeChosen: r.regimeChosen === "new" ? "New Regime" : "Old Regime",
          grossSalary: r.grossSalary,
          totalIncome: r.totalIncome,
          taxPayable: r.taxPayable,
          tdsDeducted: r.tdsDeducted,
          refundDue: Math.max(0, r.refundDue),
          balancePayable: Math.max(0, -r.refundDue),
          warningCount: r.warnings.length,
        },
        trace: r.trace,
      };
    },
  },

  /* --------------------------------------------------------------- tutor */
  list_deduction_sections: {
    name: "list_deduction_sections",
    description: "List the deduction sections that exist and what each one covers, in plain language. Returns section names and descriptions only, never any amount the user has claimed.",
    inputSchema: Empty,
    component: "section_list",
    async run() {
      const cat = deductionCatalogue().map((c) => ({ section: c.section, label: c.label }));
      return { data: cat, facts: { sectionCount: cat.length }, trace: null };
    },
  },

  search_concepts: {
    name: "search_concepts",
    description: "Search the explanatory corpus for material that answers a conceptual question. Returns prose written for someone with no financial background. It never returns a figure, because the corpus contains none.",
    inputSchema: z.object({
      query: z.string().min(2).max(300).describe("What the user wants explained."),
    }),
    component: "concept_answer",
    async run(a) {
      const { retrieve } = await import("../retrieval");
      const r = await retrieve(a.query, 3);
      return {
        data: {
          query: a.query,
          method: r.method,
          note: r.note,
          results: r.hits.map((h) => ({
            id: h.id, title: h.title, category: h.category, level: h.level,
            body: h.body, relatedTools: h.relatedTools, score: Math.round(h.score * 100) / 100,
          })),
        },
        facts: {
          resultCount: r.hits.length,
          method: r.method,
          topTitle: r.hits[0]?.title ?? "none",
        },
        trace: null,
      };
    },
  },
};

export const TOOL_NAMES = Object.keys(TOOLS);
