# OfferPSP universal ingestion and Telegram offer standard

Updated: 2026-08-03

## Product rule

Input format and merchant presentation are independent.

OfferPSP may receive a PSP rate card as:

- a Telegram message;
- plain text or email;
- CSV/TSV or an Excel workbook;
- PDF or DOCX;
- API payload;
- a manually entered offer.

Every source follows the same controlled pipeline:

```text
original source
→ text/table extraction
→ normalized private draft
→ parser checks and staff review
→ margin calculation
→ immutable client snapshot
→ Telegram-format merchant offer
```

The source file or message and its hash remain private audit evidence. Extraction is not
publication. A parser or AI model may propose fields, but it must never invent a missing rate,
limit, GEO, currency, flow or settlement term. Missing and ambiguous values go to the staff
review queue.

## One offer, two flows

One source offer remains one merchant offer. If it contains both PayIn and PayOut, they are not
split into unrelated options and are never combined into one unlabeled rate or limit string.

They are rendered as two explicit sections inside the same offer:

```text
🇷🇺 GEO - Russia (P2P C2C)

Currency - RUB
Type of traffic - Both (FTD&Trusted)
Card brands: Visa / MasterCard / MIR
Method: Cards
Card issue: Russia

PayIn
Min/Max per transaction PayIn 3 000-150 000 RUB
MDR PayIn - 13.0%

PayOut
Min/Max per transaction PayOut 5 000-50 000 RUB
MDR PayOut - 4.0%

Settlement:
Settlement period: T+1
```

This concise Telegram-message structure is the canonical merchant presentation for the portal,
chat, email copy, bot messages and staff previews. A table or PDF received from a PSP does not
change the merchant-facing structure.

## Canonical normalized fields

The renderer uses structured values, never positional strings:

- GEO and coverage scope;
- transaction currency;
- traffic type;
- card brands and card-issuance restriction;
- payment method;
- separate PayIn and PayOut fee components;
- separate PayIn and PayOut limits;
- settlement currency, fee, minimum and period;
- chargeback, refund and rolling-reserve terms;
- integration and material operational conditions.

Provider identity, source/base rates and OfferPSP/agent margins remain private. The merchant sees
only the final calculated client rate.

## Source adapters

`scripts/extract-offer-source.py` extracts reviewable text from TXT/Markdown, CSV/TSV, XLSX,
PDF and DOCX. It writes private metadata with the original file hash and marks the result as
requiring staff review.

`scripts/prepare-offer-rate-card.mjs` normalizes the extracted text into the private draft JSON.
It accepts the BRPay and Antarex presets or any new PSP through `--provider-name`.

Scanned PDFs or images without an embedded text layer require OCR. OCR output remains a draft and
must pass the same field checks. The production n8n ingestion workflow should use native file
extraction/OCR adapters, then send the canonical draft to the existing review queue.

## Publication gate

An offer cannot be published while a blocking anomaly remains. Staff must be able to compare:

1. the immutable original source;
2. extracted text;
3. normalized private fields;
4. the exact Telegram-format preview with final merchant rates.

Only the reviewed snapshot may be sent to a merchant.
