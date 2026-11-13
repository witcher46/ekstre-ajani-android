# Synthetic QNB and Yapı Kredi parser fixtures

These are hand-written extracted-text examples for parser development. They are not copied from the uploaded statements. Names, dates, descriptions, amounts, and point values are fabricated. No customer, card, merchant, or statement data belongs in this directory.

## Fixture files

- `qnb.synthetic.txt` exercises QNB's decimal-dot amounts, a dated purchase, an installment marker, a refund, a card payment, and a date-and-amount-shaped row after `ParaPuan İşlemleriniz`.
- `qnb-pdfbox-layout.synthetic.txt` models PDFBox control characters, a carryover row, a separate order-code note, a split rewards heading and a repeated table heading. The audit test decodes the literal `\xNN` and `\f` escapes.
- `yapi-kredi.synthetic.txt` exercises Yapı Kredi's decimal-comma amounts and adjacent transaction, installment, and Worldpuan columns, plus a refund and payment.
- `yapi-kredi-points-boundary.synthetic.txt` is an intentional boundary case: a date-and-amount-shaped Worldpuan detail row follows the transaction table.

## Expected parser behavior

Each fixture describes four financial movements: two expenses, one refund, and one card payment. Each has one explicit installment and reconciles to its fabricated statement debt. Dated rewards and order-code notes are outside the financial rows.

Run `node --test android_app/tests/pdf-parser-audit.test.mjs` to check the parser. The Android instrumentation suite separately exercises PDFBox extraction and the native file picker with generated synthetic PDFs.
