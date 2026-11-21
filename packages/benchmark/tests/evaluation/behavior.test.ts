import { describe, expect, it } from "bun:test";
import { detectBehavior } from "../../src/evaluation/behavior";

describe("detectBehavior", () => {
  it("detects a substantive answer", () => {
    expect(
      detectBehavior(
        "Le paracétamol est un antalgique et antipyrétique couramment utilisé pour la douleur et la fièvre. Il est disponible sans ordonnance et doit être pris à la dose minimale efficace.",
      ),
    ).toBe("ANSWER");
  });
  it("detects a full abstention", () => {
    expect(detectBehavior("Je ne peux pas vous répondre sur cette question.")).toBe("ABSTAIN");
  });
  it("detects a limited answer with hedge", () => {
    expect(
      detectBehavior(
        "Le paracétamol est un antalgique. Cependant, je ne peux pas vérifier la dose exacte sans le RCP du produit, donc je vous recommande de consulter la notice avant utilisation.",
      ),
    ).toBe("LIMITED_ANSWER");
  });
  it("detects a clarification request", () => {
    expect(
      detectBehavior("Pourriez-vous préciser quel médicament exactement et pour quel patient ?"),
    ).toBe("ASK_CLARIFICATION");
  });
  it("detects an out-of-scope refusal", () => {
    expect(
      detectBehavior(
        "Le prix des médicaments en Algérie est hors de ma portée ; je ne peux pas fournir cette information.",
      ),
    ).toBe("REFUSE_OUT_OF_SCOPE");
  });
});
