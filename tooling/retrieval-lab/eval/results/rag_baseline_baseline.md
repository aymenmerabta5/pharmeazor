# RAG baseline — offline lexical measurement

Generated: `2026-11-25T10:51:21.478029+00:00`

## Corpus

- Path: `tooling\cleaning-lab\output\context\embed-input.jsonl`
- SHA-256: `4d7f61dbaea651c28dd18f00045bbb2e41c55f3d1efd6d20346c169a957ebccf`
- Chunks: 7,245
- Artifacts: 528
- Contextual notes: 7,245
- Languages: {'en': 2640, 'fr': 4605}

## In-corpus retrieval

| Mode             | Recall@5 | Recall@10 | Recall@20 | Recall@50 | Precision@5 | Precision@10 | MRR@10 | nDCG@10 | Hit@10 | Zero-hit |
| ---------------- | -------: | --------: | --------: | --------: | ----------: | -----------: | -----: | ------: | -----: | -------: |
| raw_chunk        |   0.1667 |    0.1667 |    0.3000 |    0.3000 |      0.0400 |       0.0200 | 0.0933 |  0.1083 | 0.2000 |       10 |
| contextual_chunk |   0.3333 |    0.3667 |    0.3667 |    0.4333 |      0.0667 |       0.0400 | 0.1944 |  0.2361 | 0.4000 |        8 |

## By language

| Language |   n | Raw R@10 | Contextual R@10 | Raw MRR@10 | Contextual MRR@10 |
| -------- | --: | -------: | --------------: | ---------: | ----------------: |
| ar       |   5 |   0.2000 |          0.2000 |     0.2000 |            0.1000 |
| en       |   4 |   0.0000 |          0.5000 |     0.0000 |            0.3750 |
| fr       |   6 |   0.2500 |          0.4167 |     0.0667 |            0.1528 |

## By category

| Category                       |   n | Raw R@10 | Contextual R@10 |
| ------------------------------ | --: | -------: | --------------: |
| CONTRAINDICATIONS_AND_WARNINGS |   2 |   0.5000 |          0.5000 |
| DOSAGE_AND_NUMERICAL_KNOWLEDGE |   3 |   0.0000 |          0.0000 |
| DRUG_INTERACTIONS              |   2 |   0.0000 |          0.5000 |
| GENERAL_MEDICATION_KNOWLEDGE   |   3 |   0.0000 |          0.3333 |
| MEDICATION_IDENTIFICATION      |   3 |   0.5000 |          0.8333 |
| TRAP_AND_OUT_OF_SCOPE          |   2 |   0.0000 |          0.0000 |

## Out-of-corpus behaviour

| Mode             | Questions | Empty results | Leak in top 10 | Mean top-1 score | Median top-1 score | Max top-1 score |
| ---------------- | --------: | ------------: | -------------: | ---------------: | -----------------: | --------------: |
| raw_chunk        |         5 |             1 |              0 |          18.8298 |            23.4741 |         28.6887 |
| contextual_chunk |         5 |             1 |              0 |          15.7577 |            18.0131 |         25.0449 |

## Reproduction

```bash
python tooling/retrieval-lab/eval/evaluate_rag_baseline.py
```
