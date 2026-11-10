<?php

namespace App\Enums\Accounting;

/**
 * Belge türü.
 *
 * Her tür kendi numara serisini, muhasebe yönünü ve fiş türünü belirler.
 * Avans, nihai, proforma ve düzeltme belgeleri birbirinden ayrı — doküman
 * §5.1 bunları karıştırmamayı açıkça istiyor.
 */
enum DocumentType: string
{
    case SalesInvoice     = 'sales_invoice';
    case SalesCreditNote  = 'sales_credit_note';
    case SalesDebitNote   = 'sales_debit_note';
    case SalesAdvance     = 'sales_advance';
    case Proforma         = 'proforma';

    case PurchaseInvoice    = 'purchase_invoice';
    case PurchaseCreditNote = 'purchase_credit_note';
    case PurchaseDebitNote  = 'purchase_debit_note';
    case PurchaseAdvance    = 'purchase_advance';
    case Expense            = 'expense';

    public function label(): string
    {
        return match ($this) {
            self::SalesInvoice       => 'Satış faturası',
            self::SalesCreditNote    => 'Satış iade faturası',
            self::SalesDebitNote     => 'Satış borç dekontu',
            self::SalesAdvance       => 'Alınan avans faturası',
            self::Proforma           => 'Proforma fatura',
            self::PurchaseInvoice    => 'Alış faturası',
            self::PurchaseCreditNote => 'Alış iade faturası',
            self::PurchaseDebitNote  => 'Alış borç dekontu',
            self::PurchaseAdvance    => 'Verilen avans faturası',
            self::Expense            => 'Masraf belgesi',
        };
    }

    /** Satış mı alış mı; vergi kodu yönü ve cari tarafı buna bağlı. */
    public function direction(): string
    {
        return match ($this) {
            self::SalesInvoice, self::SalesCreditNote, self::SalesDebitNote,
            self::SalesAdvance, self::Proforma => 'sale',
            default                            => 'purchase',
        };
    }

    /** Numara serisi ön eki. */
    public function prefix(): string
    {
        return match ($this) {
            self::SalesInvoice       => 'SF',
            self::SalesCreditNote    => 'SI',
            self::SalesDebitNote     => 'SB',
            self::SalesAdvance       => 'SA',
            self::Proforma           => 'PF',
            self::PurchaseInvoice    => 'AF',
            self::PurchaseCreditNote => 'AI',
            self::PurchaseDebitNote  => 'AB',
            self::PurchaseAdvance    => 'AA',
            self::Expense            => 'MS',
        };
    }

    /** Hangi fiş türüne yazılır. */
    public function journalType(): JournalType
    {
        return $this->direction() === 'sale' ? JournalType::Sales : JournalType::Purchase;
    }

    /**
     * Tutarların işareti.
     *
     * İade ve borç dekontu aynı hesapları ters yönde kullanır; ayrı hesap
     * eşlemesi tutmak yerine yönü çeviriyoruz.
     */
    public function sign(): int
    {
        return match ($this) {
            self::SalesCreditNote, self::PurchaseCreditNote => -1,
            default                                         => 1,
        };
    }

    /**
     * Deftere girer mi.
     *
     * Proforma teklif niteliğindedir; vergi doğurmaz, fiş üretmez. Yasal
     * belge sayılmadığı için numarası da ayrı seriden gider.
     */
    public function createsJournalEntry(): bool
    {
        return $this !== self::Proforma;
    }

    /** Resmî vergi belgesi mi; silinemezlik ve saklama kuralları buna bağlı. */
    public function isTaxDocument(): bool
    {
        return $this !== self::Proforma;
    }

    /** Düzeltme belgesi mi; orijinal belge referansı zorunlu olur. */
    public function isCorrection(): bool
    {
        return in_array($this, [
            self::SalesCreditNote, self::SalesDebitNote,
            self::PurchaseCreditNote, self::PurchaseDebitNote,
        ], true);
    }

    /** Hangi belgenin düzeltmesi olabilir. */
    public function correctsType(): ?self
    {
        return match ($this) {
            self::SalesCreditNote, self::SalesDebitNote       => self::SalesInvoice,
            self::PurchaseCreditNote, self::PurchaseDebitNote => self::PurchaseInvoice,
            default                                           => null,
        };
    }

    /** Avans belgesi mi; nihai faturada mahsup edilir. */
    public function isAdvance(): bool
    {
        return in_array($this, [self::SalesAdvance, self::PurchaseAdvance], true);
    }
}
