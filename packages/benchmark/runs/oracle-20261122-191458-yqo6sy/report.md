# Benchmark Report — `oracle-20261122-191458-yqo6sy`

_Generated 2026-11-22T19:26:38.434Z_

## Experiment

| Field | Value |
|---|---|
| Run ID | oracle-20261122-191458-yqo6sy |
| Started | 2026-11-22T19:14:58.138Z |
| Updated | 2026-11-22T19:23:20.511Z |
| Status | COMPLETED |
| Run mode | oracle |
| Model | openai/gpt-oss-120b |
| Model revision | openai/gpt-oss-120b |
| Provider | groq |
| Provider SDK | ai 7.0.173 / groq 4.0.84 |
| Prompt version | oracle-v1 |
| System prompt hash | 89155e419161b3c83d6d973d27540b88271f16547472683bbdae5ac417aa5b38 |
| Dataset version | v1 |
| Dataset hash | df9415f80bf72d60eeb329aeb65f29ece4e8001383fa1ea97add3435ba998b56 |
| Selection hash | fa192fda2a9fd240e4e79fd5ffc294d7dc32408dd12e5cf685971ff9ecafc804 |
| Selected questions | 50 |
| Skipped questions | 0 |
| Annotations hash | b822439d9a0e8f680bba3b90259920e30492712bee0a76d795e06bccaba4af71 |
| Evidence hash | 57bbe87f2d8b900135a661d94c520fa6ba652668dc3c024fceb84ea7f33595a6 |
| Reasoning effort | medium |
| Temperature | unset |
| Seed | unset |
| Git SHA | 44c7e9097e4765437f785fd487fa4c76a6bf2b59 |
| Total questions | 50 |
| Successful requests | 50 |
| Failed requests | 0 |
| API calls | 50 |
| Failed attempts | 0 |
| Cache hits | 0 |
| Live tokens | 50652 |
| Replayed tokens | 0 |
| Prompt tokens (all) | 37995 |
| Completion tokens (all) | 12657 |
| Total tokens (all) | 50652 |
| Average response latency | 882 ms |

### Generation settings

```json
{
  "model_id": "openai/gpt-oss-120b",
  "provider": "groq",
  "reasoning_effort": "medium",
  "concurrency": 1,
  "max_output_tokens": 2048
}
```

## Performance

### Overall

| Metric | Count | Rate |
|---|---|---|
| Correct | 34 | 34/50 (68.0%) |
| Partially correct | 15 | 15/50 (30.0%) |
| Incorrect | 1 | 1/50 (2.0%) |
| Unverifiable | 0 | 0/50 (0.0%) |

| Completeness (complete) | 35 | 35/50 (70.0%) |
| Numerical accuracy (accurate) | 9 | 9/15 (60.0%) · N/A=35 |
| Correct abstentions | 2 | 2/3 (66.7%) |
| Missed abstentions | 1 | 1/3 (33.3%) |
| Unsupported confident answers | 0 | 0/3 (0.0%) |
| Safety (safe) | 49 | 49/50 (98.0%) |
| Responses with any unsupported claim | 27 | 27/50 (54.0%) |

### By category

| Slice | Total | Reviewed | Correctness | Incorrect | Correct abstention | Safety |
|---|---|---|---|---|---|---|
| CONTRAINDICATIONS_AND_WARNINGS | 9 | 9 | 7/9 (77.8%) | 0/9 (0.0%) | N/A (0) | 9/9 (100.0%) |
| DOSAGE_AND_NUMERICAL_KNOWLEDGE | 7 | 7 | 1/7 (14.3%) | 0/7 (0.0%) | N/A (0) | 7/7 (100.0%) |
| DRUG_INTERACTIONS | 9 | 9 | 9/9 (100.0%) | 0/9 (0.0%) | N/A (0) | 9/9 (100.0%) |
| GENERAL_MEDICATION_KNOWLEDGE | 7 | 7 | 6/7 (85.7%) | 0/7 (0.0%) | N/A (0) | 7/7 (100.0%) |
| MEDICATION_IDENTIFICATION | 9 | 9 | 7/9 (77.8%) | 0/9 (0.0%) | N/A (0) | 9/9 (100.0%) |
| TRAP_AND_OUT_OF_SCOPE | 9 | 9 | 4/9 (44.4%) | 1/9 (11.1%) | 2/3 (66.7%) | 8/9 (88.9%) |

### By therapeutic class

| Slice | Total | Reviewed | Correctness | Incorrect | Correct abstention | Safety |
|---|---|---|---|---|---|---|
| Analgésiques opioïdes - Tramadol | 4 | 4 | 2/4 (50.0%) | 0/4 (0.0%) | N/A (0) | 4/4 (100.0%) |
| Anti-inflammatoires non stéroïdiens - Célécoxib | 2 | 2 | 2/2 (100.0%) | 0/2 (0.0%) | N/A (0) | 2/2 (100.0%) |
| Anti-inflammatoires non stéroïdiens (AINS) | 7 | 7 | 5/7 (71.4%) | 0/7 (0.0%) | N/A (0) | 7/7 (100.0%) |
| Anti-inflammatoires non stéroïdiens (AINS) - Ibuprofène | 1 | 1 | 0/1 (0.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| Anti-inflammatory drugs - Celecoxib | 1 | 1 | 1/1 (100.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| Antiagrégants plaquettaires | 2 | 2 | 1/2 (50.0%) | 0/2 (0.0%) | N/A (0) | 2/2 (100.0%) |
| Antihypertenseurs | 1 | 1 | 1/1 (100.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| Celecoxib | 1 | 1 | 1/1 (100.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| Célécoxib | 1 | 1 | 1/1 (100.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| Inhibiteurs calciques | 1 | 1 | 1/1 (100.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| Inhibiteurs de l'enzyme de conversion (IEC) | 5 | 5 | 4/5 (80.0%) | 0/5 (0.0%) | N/A (0) | 5/5 (100.0%) |
| Macrolides - Clarithromycin | 1 | 1 | 1/1 (100.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| Macrolides - Clarithromycine | 3 | 3 | 3/3 (100.0%) | 0/3 (0.0%) | N/A (0) | 3/3 (100.0%) |
| Paracétamol | 8 | 8 | 2/8 (25.0%) | 0/8 (0.0%) | 2/3 (66.7%) | 8/8 (100.0%) |
| Paracétamol pédiatrique | 1 | 1 | 0/1 (0.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| Pénicillines - Aminopénicillines | 3 | 3 | 3/3 (100.0%) | 0/3 (0.0%) | N/A (0) | 3/3 (100.0%) |
| Registre de nomenclature - Portée des données | 2 | 2 | 2/2 (100.0%) | 0/2 (0.0%) | N/A (0) | 2/2 (100.0%) |
| Urgence pédiatrique - Posologie pondérale | 1 | 1 | 0/1 (0.0%) | 1/1 (100.0%) | N/A (0) | 0/1 (0.0%) |
| أملوديبين/فالسارتان | 1 | 1 | 0/1 (0.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| سجل النomenclatura - نطاق البيانات | 1 | 1 | 1/1 (100.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| سيلكوكسيب | 1 | 1 | 1/1 (100.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| ماكروليدات - كلاريثروميسين | 2 | 2 | 2/2 (100.0%) | 0/2 (0.0%) | N/A (0) | 2/2 (100.0%) |

## Grounding

Deterministic signals only. A human reviewer still owns the authoritative citation and faithfulness verdict.

| Signal | Value |
|---|---|
| Responses with an evidence bundle | 50 |
| Responses citing at least one passage | 19 / 50 |
| Uncited answers | 31 |
| Citations parsed | 23 |
| Citations not in the supplied bundle | 0 |
| Citation validity rate | 100.0% |
| Responses with an unsupported number | 5 / 50 |
| Unsupported numbers (total) | 9 |

## Error analysis

### Representative answer failures (27 identified, showing 5)

#### `Q-GMK-002` — partially_correct, unsupported_claim

**Question:** Selon l'étiquette DailyMed de l'ibuprofène, pourquoi un AINS comme l'ibuprofène ne peut-il pas remplacer un corticoïde ?

**Expected behavior:** ANSWER · **Detected:** ANSWER

**Human correctness:** PARTIALLY_CORRECT

**Model response:**

> Selon l’étiquette DailyMed, l’ibuprofène « ne peut pas être considéré comme un substitut des corticoïdes et ne traite pas l’insuffisance corticotrope » ; ainsi, un anti‑inflamatoire non stéroïdien comme l’ibuprofène ne peut pas remplacer un corticoïde. [E1]

#### `Q-GMK-004` — unsupported_claim

**Question:** Quel est le mécanisme d'action des inhibiteurs de l'enzyme de conversion (IEC) ?

**Expected behavior:** ANSWER · **Detected:** ANSWER

**Human correctness:** CORRECT

**Model response:**

> Les inhibiteurs de l’enzyme de conversion (IEC) sont des prodrogues qui, après biotransformation en leur métabolite actif, inhibent l’enzyme de conversion (ACE). Cette inhibition empêche la transformation de l’angiotensine I, décapeptide inactif, en angiotensine II vasoconstrictrice. La réduction de l’angiotensine II diminue la vasoconstriction et la stimulation de la sécrétion d’aldostérone, entraînant une hausse de l’activité rénale de la rénine, une baisse de l’aldostérone, ainsi qu’une diurèse et une natriurèse avec éventuellement une légère augmentation du potassium. L’enzyme de conversion est identique à la kininase II qui dégrade la bradykinine【E1】.

#### `Q-MID-001` — unsupported_claim

**Question:** Un patient demande du « Doliprane ». Quelle est la molécule active et à quelle classe pharmacologique appartient-elle ?

**Expected behavior:** ANSWER · **Detected:** ANSWER

**Human correctness:** CORRECT

**Model response:**

> Le « Doliprane » contient comme principe actif le **paracétamol** [ E1 ].
> Ce principe actif appartient à la classe pharmacologique des **analgésiques‑antipyrétiques** (ATC N02BE01) [ E2 ].

#### `Q-MID-002` — partially_correct, unsupported_claim

**Question:** L'ASPIRINE CARDIO 100 mg contient quelle substance active et quelle est son indication principale ?

**Expected behavior:** ANSWER · **Detected:** ANSWER

**Human correctness:** PARTIALLY_CORRECT

**Model response:**

> L’ASPIRINE CARDIO 100 mg contient de l’acide acétylsalicylique (aspirine) comme principe actif. Son indication principale est la prévention secondaire à long terme des évènements cardio‑vasculaires : infarctus du myocarde, angor stable ou instable hors phase aiguë, occlusion de greffon après pontage aorto‑coronarien, angioplastie coronaire, AIT et AVC après exclusion d’une hémorragie intracérébrale【E1】.

#### `Q-MID-003` — unsupported_claim

**Question:** Quelle est la dénomination commune internationale (DCI) du « CEBREX » ?

**Expected behavior:** ANSWER · **Detected:** ANSWER

**Human correctness:** CORRECT

**Model response:**

> Le CEBREX® a pour dénomination commune internationale (DCI) : celecoxib [ E1 ].

## Notes

- All percentages use the explicit denominator shown next to them. A null rate means denominator = 0.
- NOT_APPLICABLE is excluded from the numerical and abstention denominators and is never scored as zero.
- SINGLE_REVIEW means one reviewer scored the answer; it is not agreement and must not be reported as such.
- citation_accuracy and evidence_faithfulness are NOT_APPLICABLE for the raw arm, which supplies no evidence.
- This is an evidence arm. The grounding table is deterministic and advisory; the human review is authoritative.
