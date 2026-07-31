import axios from "axios";

export interface WiseTransaction {
  type: string;
  date: string;
  amount: {
    value: number;
    currency: string;
  };
  details?: {
    type?: string;
    description?: string;
    senderName?: string;
    paymentReference?: string;
    category?: string;
    transferId?: string;
    [key: string]: any;
  };
  referenceNumber?: string;
  runningBalance?: any;
  [key: string]: any;
}

export interface VerifyPaymentOptions {
  wiseTransferId?: string;
  email?: string;
  amount?: number;
  currency?: string;
  intervalStart?: string;
  intervalEnd?: string;
}

class WiseService {
  private get baseURL(): string {
    const host = process.env.WISE_API_HOST;

    if (!host) {
      throw new Error("WISE_API_HOST is missing");
    }

    return host.replace(/\/+$/, "");
  }

  private get token(): string {
    if (!process.env.WISE_API_TOKEN) {
      throw new Error("WISE_API_TOKEN is missing");
    }
    return process.env.WISE_API_TOKEN;
  }

  private get profileId(): string {
    if (!process.env.WISE_PROFILE_ID) {
      throw new Error("WISE_PROFILE_ID is missing");
    }
    return process.env.WISE_PROFILE_ID;
  }

  private get balanceId(): string {
    const bId = process.env.WISE_BALANCE_ID;

    if (!bId) {
      throw new Error("WISE_BALANCE_ID is missing");
    }

    return bId;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Fetch profiles for the authenticated Wise user
   */
  async getProfiles(): Promise<any> {
    const url = `${this.baseURL}/profiles`;
    const response = await axios.get(url, { headers: this.headers() });
    return response.data;
  }

  /**
   * Fetch balances for a given profile ID
   */
  async getBalances(profileId?: string): Promise<any> {
    const pId = profileId || this.profileId;
    const url = `${this.baseURL}/profiles/${pId}/balances?types=STANDARD`;
    const response = await axios.get(url, { headers: this.headers() });
    return response.data;
  }

  /**
   * Fetch balance statement for a profile & balance ID
   */
  async getBalanceStatement(
    profileId?: string,
    balanceId?: string,
    queryParams?: {
      currency?: string;
      intervalStart?: string;
      intervalEnd?: string;
      type?: string;
      statementLocale?: string;
    },
  ): Promise<any> {
    const pId = profileId || this.profileId;
    let bId = balanceId;

    if (!bId) {
      // Try to find a balance matching the query currency
      try {
        const balances = await this.getBalances(pId);
        if (Array.isArray(balances) && balances.length > 0) {
          if (queryParams?.currency) {
            const match = balances.find(
              (b) =>
                (b.currency || "").toUpperCase() ===
                queryParams.currency?.toUpperCase(),
            );
            if (match) bId = String(match.id);
          }
          if (!bId) {
            const primary = balances.find((b) => b.primary) || balances[0];
            if (primary) bId = String(primary.id);
          }
        }
      } catch (err) {
        // ignore and fallback to balanceId property
      }
      bId = bId || this.balanceId;
    }

    const currency = queryParams?.currency || "USD";
    const type = queryParams?.type || "FLAT";
    const statementLocale = queryParams?.statementLocale || "en";

    const now = new Date();
    const defaultStart = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const defaultEnd = now.toISOString();

    const intervalStart = queryParams?.intervalStart || defaultStart;
    const intervalEnd = queryParams?.intervalEnd || defaultEnd;

    const url = `${this.baseURL}/profiles/${pId}/balance-statements/${bId}/statement.json`;

    const response = await axios.get(url, {
      headers: this.headers(),
      params: {
        currency,
        intervalStart,
        intervalEnd,
        type,
        statementLocale,
      },
    });

    return response.data;
  }

  /**
   * Verify an incoming payment in Wise balance statements across all active balances
   */
  async verifyWiseTransaction(options: VerifyPaymentOptions): Promise<{
    matched: boolean;
    transaction?: WiseTransaction;
    reason?: string;
  }> {
    try {
      let activeBalances: any[] = [];
      try {
        const fetched = await this.getBalances();
        if (Array.isArray(fetched) && fetched.length > 0) {
          activeBalances = fetched;
        }
      } catch (e) {
        // fallback
      }

      let allTransactions: WiseTransaction[] = [];

      if (activeBalances.length > 0) {
        // If currency specified, prioritize matching currency balance
        if (options.currency) {
          const targetCurr = options.currency.toUpperCase();
          activeBalances.sort((a, b) => {
            if ((a.currency || "").toUpperCase() === targetCurr) return -1;
            if ((b.currency || "").toUpperCase() === targetCurr) return 1;
            return 0;
          });
        }

        for (const bal of activeBalances) {
          try {
            const statement = await this.getBalanceStatement(
              undefined,
              String(bal.id),
              {
                currency: bal.currency,
                intervalStart: options.intervalStart,
                intervalEnd: options.intervalEnd,
              },
            );

            const txs: WiseTransaction[] = statement?.transactions || [];
            allTransactions.push(...txs);
          } catch (err) {
            // Ignore error for individual balance statement fetch
          }
        }
      } else {
        const statement = await this.getBalanceStatement(undefined, undefined, {
          currency: options.currency || "USD",
          intervalStart: options.intervalStart,
          intervalEnd: options.intervalEnd,
        });
        allTransactions = statement?.transactions || [];
      }

      if (!allTransactions || allTransactions.length === 0) {
        return {
          matched: false,
          reason: "No transactions found in the specified interval",
        };
      }

      const creditTransactions = allTransactions.filter((tx) => {
        const typeUpper = (tx.type || "").toUpperCase();
        const detailsTypeUpper = (tx.details?.type || "").toUpperCase();
        const val = Number(tx.amount?.value || 0);

        return (
          typeUpper === "CREDIT" ||
          detailsTypeUpper.includes("CREDIT") ||
          detailsTypeUpper.includes("DEPOSIT") ||
          (val > 0 && typeUpper !== "DEBIT")
        );
      });

      if (creditTransactions.length === 0) {
        return {
          matched: false,
          reason: "No incoming credit transactions found in statement",
        };
      }

      const searchTransferId = options.wiseTransferId?.trim().toLowerCase();
      const searchEmail = options.email?.trim().toLowerCase();
      const searchAmount =
        options.amount !== undefined && !isNaN(Number(options.amount))
          ? Number(options.amount)
          : undefined;

      let bestMatch: { tx: WiseTransaction; score: number } | null = null;

      for (const tx of creditTransactions) {
        let score = 0;
        let isDirectTransferIdMatch = false;

        const refNum = (tx.referenceNumber || "").toString().toLowerCase();
        const txId = (tx.id || "").toString().toLowerCase();
        const payRef = (tx.details?.paymentReference || "")
          .toString()
          .toLowerCase();
        const transferId = (tx.details?.transferId || "")
          .toString()
          .toLowerCase();
        const description = (tx.details?.description || "")
          .toString()
          .toLowerCase();
        const senderName = (tx.details?.senderName || "")
          .toString()
          .toLowerCase();
        const senderEmail = (
          tx.details?.senderEmail ||
          tx.details?.email ||
          tx.details?.payerEmail ||
          ""
        )
          .toString()
          .toLowerCase();

        // 1. Check Transfer ID / Reference match
        if (searchTransferId) {
          const cleanSearchId = searchTransferId
            .replace(/^#/g, "")
            .replace(/^transfer-?/i, "")
            .trim();

          const exactMatch =
            refNum === searchTransferId ||
            txId === searchTransferId ||
            payRef === searchTransferId ||
            transferId === searchTransferId ||
            (cleanSearchId.length > 0 &&
              (refNum === cleanSearchId ||
                txId === cleanSearchId ||
                payRef === cleanSearchId ||
                transferId === cleanSearchId));

          const partialMatch =
            refNum.includes(searchTransferId) ||
            txId.includes(searchTransferId) ||
            payRef.includes(searchTransferId) ||
            transferId.includes(searchTransferId) ||
            description.includes(searchTransferId) ||
            senderName.includes(searchTransferId) ||
            (cleanSearchId.length > 0 &&
              (refNum.includes(cleanSearchId) ||
                txId.includes(cleanSearchId) ||
                payRef.includes(cleanSearchId) ||
                transferId.includes(cleanSearchId) ||
                description.includes(cleanSearchId)));

          if (exactMatch) {
            isDirectTransferIdMatch = true;
            score += 100;
          } else if (partialMatch) {
            isDirectTransferIdMatch = true;
            score += 80;
          }
        }

        // 2. Check Email match
        if (searchEmail) {
          if (
            senderEmail &&
            (senderEmail === searchEmail || senderEmail.includes(searchEmail))
          ) {
            score += 50;
          } else if (
            description.includes(searchEmail) ||
            senderName.includes(searchEmail) ||
            payRef.includes(searchEmail)
          ) {
            score += 30;
          }
        }

        // 3. Check Amount match
        if (searchAmount !== undefined) {
          const txValue = Number(tx.amount?.value || 0);
          if (Math.abs(txValue - searchAmount) < 0.01) {
            score += 30;
          }
        }

        // Determine if candidate matches
        const isMatched = isDirectTransferIdMatch || score >= 50;

        if (isMatched) {
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { tx, score };
          }
        }
      }

      if (bestMatch) {
        return {
          matched: true,
          transaction: bestMatch.tx,
        };
      }

      return {
        matched: false,
        reason:
          "No matching credit transaction found matching provided transfer ID, email, or reference",
      };
    } catch (error: any) {
      return {
        matched: false,
        reason:
          error?.response?.data?.message ||
          error?.message ||
          "Failed to verify Wise transaction",
      };
    }
  }

  async completePayment(orderId: number, options: VerifyPaymentOptions) {
    const result = await this.verifyWiseTransaction(options);

    if (!result.matched || !result.transaction) {
      return {
        success: false,
        message: result.reason,
      };
    }

    const transaction = result.transaction;

    // Update Order
    const order = await strapi.entityService.update(
      "api::order.order",
      orderId,
      {
        data: {
          paymentStatus: "paid",
          wiseTransactionId:
            transaction.details?.transferId || transaction.referenceNumber,
          paidAt: new Date().toISOString(),
        },
      },
    );

    // Create Payment Log
    await strapi.entityService.create("api::payment-log.payment-log", {
      data: {
        transactionId:
          transaction.details?.transferId || transaction.referenceNumber,
        amount: transaction.amount.value,
        currency: transaction.amount.currency,
        paymentMethod: "WISE",
        status: "SUCCESS",
        order: order.id,
      },
    });

    return {
      success: true,
      order,
      transaction,
    };
  }
}
export const wiseService = new WiseService();
export default wiseService;
