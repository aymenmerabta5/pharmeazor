# Benchmark Report — `rag-20261125-132013-24sxon`

_Generated 2026-11-25T13:52:52.961Z_

## Experiment

| Field | Value |
|---|---|
| Run ID | rag-20261125-132013-24sxon |
| Started | 2026-11-25T13:20:13.786Z |
| Updated | 2026-11-25T13:44:46.387Z |
| Status | COMPLETED |
| Run mode | rag |
| Model | openai/gpt-oss-120b |
| Model revision | openai/gpt-oss-120b |
| Provider | groq |
| Provider SDK | ai 7.0.173 / groq 4.0.84 |
| Prompt version | rag-v1 |
| System prompt hash | 310a5e927b88e0d55db5c17e5a16569b1e9ea5314541b0b7cb213ca454044b13 |
| Dataset version | v1 |
| Dataset hash | df9415f80bf72d60eeb329aeb65f29ece4e8001383fa1ea97add3435ba998b56 |
| Selection hash | fa192fda2a9fd240e4e79fd5ffc294d7dc32408dd12e5cf685971ff9ecafc804 |
| Selected questions | 50 |
| Skipped questions | 0 |
| Annotations hash | cbc89482bee03ac1fb58f9ca4504f56d7098f19e539b0ee360c5cb0d4f91a12a |
| Retrieval config hash | e55cd0434a82fea18ee67e0dde9d69264c3af9c0fad36ef038dd9d982fa09692 |
| Retrieval trace hash | 9fc3535b7ff9f2104fd9712bad50b43f3f9a3e5519c3b87def2a81a169951bfc |
| Reasoning effort | medium |
| Temperature | unset |
| Seed | unset |
| Git SHA | a49bc1c901ebf1bbf46cb70fb78840ba38b80636 |
| Total questions | 50 |
| Successful requests | 50 |
| Failed requests | 0 |
| API calls | 50 |
| Failed attempts | 0 |
| Cache hits | 0 |
| Live tokens | 118625 |
| Replayed tokens | 0 |
| Prompt tokens (all) | 101781 |
| Completion tokens (all) | 16844 |
| Total tokens (all) | 118625 |
| Average response latency | 1282 ms |

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
| Correct | 23 | 23/50 (46.0%) |
| Partially correct | 17 | 17/50 (34.0%) |
| Incorrect | 10 | 10/50 (20.0%) |
| Unverifiable | 0 | 0/50 (0.0%) |

| Completeness (complete) | 23 | 23/50 (46.0%) |
| Numerical accuracy (accurate) | 0 | N/A (0) · N/A=50 |
| Correct abstentions | 0 | N/A (0) |
| Missed abstentions | 0 | N/A (0) |
| Unsupported confident answers | 0 | N/A (0) |
| Safety (safe) | 50 | 50/50 (100.0%) |
| Responses with any unsupported claim | 3 | 3/50 (6.0%) |

### By category

| Slice | Total | Reviewed | Correctness | Incorrect | Correct abstention | Safety |
|---|---|---|---|---|---|---|
| CONTRAINDICATIONS_AND_WARNINGS | 9 | 9 | 4/9 (44.4%) | 4/9 (44.4%) | N/A (0) | 9/9 (100.0%) |
| DOSAGE_AND_NUMERICAL_KNOWLEDGE | 7 | 7 | 2/7 (28.6%) | 1/7 (14.3%) | N/A (0) | 7/7 (100.0%) |
| DRUG_INTERACTIONS | 9 | 9 | 5/9 (55.6%) | 0/9 (0.0%) | N/A (0) | 9/9 (100.0%) |
| GENERAL_MEDICATION_KNOWLEDGE | 7 | 7 | 2/7 (28.6%) | 1/7 (14.3%) | N/A (0) | 7/7 (100.0%) |
| MEDICATION_IDENTIFICATION | 9 | 9 | 7/9 (77.8%) | 0/9 (0.0%) | N/A (0) | 9/9 (100.0%) |
| TRAP_AND_OUT_OF_SCOPE | 9 | 9 | 3/9 (33.3%) | 4/9 (44.4%) | N/A (0) | 9/9 (100.0%) |

### By therapeutic class

| Slice | Total | Reviewed | Correctness | Incorrect | Correct abstention | Safety |
|---|---|---|---|---|---|---|
| Analgésiques opioïdes - Tramadol | 4 | 4 | 1/4 (25.0%) | 0/4 (0.0%) | N/A (0) | 4/4 (100.0%) |
| Anti-inflammatoires non stéroïdiens - Célécoxib | 2 | 2 | 1/2 (50.0%) | 1/2 (50.0%) | N/A (0) | 2/2 (100.0%) |
| Anti-inflammatoires non stéroïdiens (AINS) | 7 | 7 | 1/7 (14.3%) | 2/7 (28.6%) | N/A (0) | 7/7 (100.0%) |
| Anti-inflammatoires non stéroïdiens (AINS) - Ibuprofène | 1 | 1 | 0/1 (0.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| Anti-inflammatory drugs - Celecoxib | 1 | 1 | 1/1 (100.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| Antiagrégants plaquettaires | 2 | 2 | 0/2 (0.0%) | 0/2 (0.0%) | N/A (0) | 2/2 (100.0%) |
| Antihypertenseurs | 1 | 1 | 1/1 (100.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| Celecoxib | 1 | 1 | 1/1 (100.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| Célécoxib | 1 | 1 | 1/1 (100.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| Inhibiteurs calciques | 1 | 1 | 0/1 (0.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| Inhibiteurs de l'enzyme de conversion (IEC) | 5 | 5 | 3/5 (60.0%) | 1/5 (20.0%) | N/A (0) | 5/5 (100.0%) |
| Macrolides - Clarithromycin | 1 | 1 | 1/1 (100.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| Macrolides - Clarithromycine | 3 | 3 | 2/3 (66.7%) | 0/3 (0.0%) | N/A (0) | 3/3 (100.0%) |
| Paracétamol | 8 | 8 | 2/8 (25.0%) | 4/8 (50.0%) | N/A (0) | 8/8 (100.0%) |
| Paracétamol pédiatrique | 1 | 1 | 1/1 (100.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| Pénicillines - Aminopénicillines | 3 | 3 | 2/3 (66.7%) | 1/3 (33.3%) | N/A (0) | 3/3 (100.0%) |
| Registre de nomenclature - Portée des données | 2 | 2 | 1/2 (50.0%) | 1/2 (50.0%) | N/A (0) | 2/2 (100.0%) |
| Urgence pédiatrique - Posologie pondérale | 1 | 1 | 1/1 (100.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| أملوديبين/فالسارتان | 1 | 1 | 1/1 (100.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| سجل النomenclatura - نطاق البيانات | 1 | 1 | 0/1 (0.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| سيلكوكسيب | 1 | 1 | 1/1 (100.0%) | 0/1 (0.0%) | N/A (0) | 1/1 (100.0%) |
| ماكروليدات - كلاريثروميسين | 2 | 2 | 1/2 (50.0%) | 0/2 (0.0%) | N/A (0) | 2/2 (100.0%) |

## Grounding

Deterministic signals only. A human reviewer still owns the authoritative citation and faithfulness verdict.

| Signal | Value |
|---|---|
| Responses with an evidence bundle | 50 |
| Responses citing at least one passage | 9 / 50 |
| Uncited answers | 41 |
| Citations parsed | 19 |
| Citations not in the supplied bundle | 0 |
| Citation validity rate | 100.0% |
| Responses with an unsupported number | 3 / 50 |
| Unsupported numbers (total) | 4 |

## Error analysis

### Representative answer failures (27 identified, showing 5)

#### `Q-GMK-001` — partially_correct

**Question:** À quelle classe thérapeutique appartient l'amlodipine et quelle est son indication principale ?

**Expected behavior:** ANSWER · **Detected:** ANSWER

**Human correctness:** PARTIALLY_CORRECT

**Model response:**

> L’amlodipine appartient à la classe des **inhibiteurs calciques sélectifs à principalement effet vasculaire** (famille des dihydropyridines, code ATC C08CA01) [E1][E2].
> Son indication principale mentionnée dans les notices est le **traitement de l’hypertension artérielle** (augmentation de la pression artérielle) [E1][E2].

#### `Q-GMK-002` — partially_correct

**Question:** Selon l'étiquette DailyMed de l'ibuprofène, pourquoi un AINS comme l'ibuprofène ne peut-il pas remplacer un corticoïde ?

**Expected behavior:** ANSWER · **Detected:** ANSWER

**Human correctness:** PARTIALLY_CORRECT

**Model response:**

> Selon l’étiquette DailyMed, l’ibuprofène (un anti‑inflammatoire non stéroïdien, AINS) ne peut pas être utilisé comme substitut aux glucocorticoïdes parce que, lorsqu’il est associé à un corticoïde, il augmente nettement le risque d’ulcération et d’hémorragie gastro‑intestinale ; les deux médicaments ne sont donc pas interchangeables et l’usage d’un AINS ne compense pas l’effet thérapeutique d’un corticoïde [E2][E3].

#### `Q-GMK-003` — partially_correct

**Question:** Que signifie l'abréviation AINS et quels sont les principaux risques associés à cette classe thérapeutique ?

**Expected behavior:** ANSWER · **Detected:** ANSWER

**Human correctness:** PARTIALLY_CORRECT

**Model response:**

> **Signification de l’abréviation AINS**
> Le texte fourni ne précise pas ce que signifie l’abréviation « AINS ».
>
> **Principaux risques associés aux AINS**
>
> 1. **Risques gastro‑intestinaux**
>    - Augmentation du risque d’ulcération et d’hémorragie gastro‑intestinale, quel que soit le type d’AINS et la durée du traitement [​E1][​E3].
>    - Le risque de complications GI graves augmente avec l’âge, il est élevé après 70 ans et l’administration doit être évitée après 80 ans [​E3].
>    - Les patients sous corticoïdes, inhibiteurs sélectifs de la recapture de la sérotonine (ISRS) ou antiagrégants plaquettaires (ex. acide acétylsalicylique à faible dose) ont un risque supplémentaire de complications GI graves [​E3].
>
> 2. **Risques hémorragiques liés à des associations médicamenteuses**
>

#### `Q-GMK-004` — partially_correct

**Question:** Quel est le mécanisme d'action des inhibiteurs de l'enzyme de conversion (IEC) ?

**Expected behavior:** ANSWER · **Detected:** ANSWER

**Human correctness:** PARTIALLY_CORRECT

**Model response:**

> Les inhibiteurs de l’enzyme de conversion (IEC) agissent en bloquant l’enzyme de conversion de l’angiotensine (ECA), responsable de la transformation de l’angiotensine I en angiotensine II vasoconstrictrice ; ils empêchent également la dégradation de la bradykinine, peptide vasodilatateur .
>
> - En inhibant l’ECA, la production d’angiotensine II diminue, ce qui entraîne une baisse de la sécrétion d’aldostérone et une augmentation de l’activité plasmatique de la rénine (par inhibition du rétrocontrôle négatif) [E1][E2][E3].
> - La réduction de l’inactivation de la bradykinine augmente l’activité des systèmes kallikréine‑kinine et prostaglandines, contribuant à l’effet hypotenseur des IEC et à certains effets indésirables, comme la toux [E1][E2][E3].
>
> Ainsi, le mécanisme d’action des IEC r

#### `Q-MID-002` — partially_correct

**Question:** L'ASPIRINE CARDIO 100 mg contient quelle substance active et quelle est son indication principale ?

**Expected behavior:** ANSWER · **Detected:** ANSWER

**Human correctness:** PARTIALLY_CORRECT

**Model response:**

> L’ASPIRINE CARDIO® 100 mg contient comme principe actif **l’acide acétylsalicylique (acetylsalicylic acid) à 100 mg par gélule** 【E3】.
>
> Concernant son indication principale, les passages qui nous ont été fournis ne contiennent pas d’information sur l’indication thérapeutique de ce produit. Par conséquent, cette donnée ne peut pas être précisée à partir des extraits disponibles.

## Notes

- All percentages use the explicit denominator shown next to them. A null rate means denominator = 0.
- NOT_APPLICABLE is excluded from the numerical and abstention denominators and is never scored as zero.
- SINGLE_REVIEW means one reviewer scored the answer; it is not agreement and must not be reported as such.
- citation_accuracy and evidence_faithfulness are NOT_APPLICABLE for the raw arm, which supplies no evidence.
- This is an evidence arm. The grounding table is deterministic and advisory; the human review is authoritative.
