import { defineTool } from "eve/tools";
import { z } from "zod";

import { lookupProductRegister } from "../lib/registry-client.ts";

/**
 * Deterministic lookup over the Algerian product register.
 *
 * This is the tool for questions the corpus answers badly: whether a brand is
 * still registered, which dispensing schedule it sits on, who holds it, and
 * whether it was withdrawn. Those are rows, not passages, and a vector search
 * over prose will either miss them or return a neighbouring product.
 *
 * It also closes the brand coverage gap from the other side. When
 * `search_medical_corpus` returns nothing for a brand, this lookup returns the
 * substance (DCI) that brand contains, which the agent can then search for.
 */
export default defineTool({
  description:
    "Look up a product in the Algerian medicines register (Ministry nomenclature and Pharm'Net). " +
    "Answers register facts only: whether a brand is registered, withdrawn or not renewed, its " +
    "dispensing schedule (LISTE I, LISTE II, STUPEFIANT), registration number, holder, " +
    "pharmaceutical form, dosage, pack, and whether it is a generic or reference product. " +
    "Use it when the user names an Algerian brand and asks whether it exists, is available, is " +
    "withdrawn, how it is dispensed, or who markets it. " +
    "Use it also when search_medical_corpus returns nothing for a brand: look the brand up, take " +
    "the substance from the `dci` field, and search the corpus again with that substance. " +
    "The register does NOT contain indications, doses, contraindications, interactions or adverse " +
    "effects. Never turn a register row into a clinical claim, a dosing recommendation, or a " +
    "statement that a product is safe or effective. A `withdrawn` or `non_renewed` status is a " +
    "safety fact: report it plainly and do not recommend the product. " +
    "Rows are exact substring matches over the register, not fuzzy matches; if a brand is not " +
    "found, say the register does not list it rather than guessing a similar name.",
  inputSchema: z.object({
    query: z
      .string()
      .min(2)
      .max(128)
      .describe(
        "Brand name (DOLIPRANE), substance (paracétamol, losartan), or registration number " +
          "(352/01 A 003/06/22). Brand and substance are matched case- and accent-insensitively as " +
          "substrings.",
      ),
    kind: z
      .enum(["auto", "brand", "substance", "registration"])
      .optional()
      .describe(
        "Where to match. `auto` (default) searches brand and substance together and also tries a " +
          "registration prefix when the query looks like one. Use `substance` to list every brand " +
          "of a substance, `brand` to avoid a substance name matching a brand.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe("Maximum rows to return. Defaults to 10."),
    includeWithdrawn: z
      .boolean()
      .optional()
      .describe(
        "Defaults to true. Withdrawn products are safety-relevant and are included unless you " +
          "explicitly ask for currently registered products only.",
      ),
  }),
  async execute(input, ctx) {
    const principal =
      ctx.session.auth.current?.principalId ?? ctx.session.auth.initiator?.principalId;
    if (!principal) {
      throw new Error(
        "Product register lookup requires an authenticated caller; this session has no principal.",
      );
    }

    const result = await lookupProductRegister(principal, input);

    return {
      query: result.query,
      kind: result.kind,
      products: result.products,
      total: result.total,
      truncated: result.truncated,
      includeWithdrawn: result.includeWithdrawn,
      disclaimer: result.disclaimer,
      guidance:
        "These are register rows, not clinical evidence. Report the registration status and " +
        "dispensing schedule exactly as returned. " +
        "If a row says `withdrawn` or `non_renewed`, say so plainly and cite the withdrawal date " +
        "and reason when present; never present a withdrawn product as available or " +
        "recommendable. " +
        "If a row says `registered`, that means the registration is current; it does not mean the " +
        "product is on the market, effective, or appropriate for this patient. " +
        "Never derive an indication, a dose, a contraindication or a safety judgement from this " +
        "result, and never answer a clinical question from it: call `search_medical_corpus` with " +
        "the substance name for that. " +
        "When `truncated` is true, `total` is how many rows match in the register: state that " +
        "number and narrow the query instead of claiming the returned page is all of them. " +
        "If `products` is empty, the register does not list the query; say that, and do not " +
        "substitute a similar brand you happen to know.",
    };
  },
});
