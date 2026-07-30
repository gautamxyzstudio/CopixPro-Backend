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
    return process.env.WISE_PROFILE_ID ;
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
    }
  ): Promise<any> {
    const pId = profileId || this.profileId;
    const bId = balanceId || this.balanceId;

    const currency = queryParams?.currency || "USD";
    const type = queryParams?.type || "FLAT";
    const statementLocale = queryParams?.statementLocale || "en";

    const now = new Date();
    const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
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
   * Verify an incoming payment in Wise balance statements
   */
  async verifyWiseTransaction(options: VerifyPaymentOptions): Promise<{
    matched: boolean;
    transaction?: WiseTransaction;
    reason?: string;
  }> {
    try {
      const statement = await this.getBalanceStatement(
        undefined,
        undefined,
        {
          currency: options.currency || "USD",
          intervalStart: options.intervalStart,
          intervalEnd: options.intervalEnd,
        }
      );

      const transactions: WiseTransaction[] = statement?.transactions || [];

      if (!transactions || transactions.length === 0) {
        return {
          matched: false,
          reason: "No transactions found in the specified interval",
        };
      }

      const creditTransactions = transactions.filter(
        (tx) => tx.type === "CREDIT" || (tx.amount && tx.amount.value > 0)
      );

      if (creditTransactions.length === 0) {
        return {
          matched: false,
          reason: "No incoming credit transactions found in statement",
        };
      }

      const searchTransferId = options.wiseTransferId?.trim().toLowerCase();
      const searchEmail = options.email?.trim().toLowerCase();
      const searchAmount = options.amount;

      for (const tx of creditTransactions) {
        let score = 0;

        const refNum = (tx.referenceNumber || "").toString().toLowerCase();
        const payRef = (tx.details?.paymentReference || "").toString().toLowerCase();
        const transferId = (tx.details?.transferId || "").toString().toLowerCase();
        const description = (tx.details?.description || "").toString().toLowerCase();
        const senderName = (tx.details?.senderName || "").toString().toLowerCase();

if (
  searchTransferId &&
  (
    refNum.includes(searchTransferId) ||
    payRef.includes(searchTransferId) ||
    transferId.includes(searchTransferId)
  )
) {
  score += 60;
}

if (
  searchEmail &&
  (
    description.includes(searchEmail) ||
    senderName.includes(searchEmail) ||
    payRef.includes(searchEmail)
  )
) {
  score += 20;
}

if (
  searchAmount &&
  Math.abs(Number(tx.amount.value) - searchAmount) < 0.01
) {
  score += 20;
}

if (score >= 80) {
  return {
    matched: true,
    transaction: tx,
  };
}
      }

      return {
        matched: false,
        reason: "No matching credit transaction found matching provided transfer ID, email, or reference",
      };
    } catch (error: any) {
      return {
        matched: false,
        reason: error?.response?.data?.message || error?.message || "Failed to verify Wise transaction",
      };
    }
  }


async completePayment(
  orderId: number,
  options: VerifyPaymentOptions
) {
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
        paymentStatus: 'paid',
        wiseTransactionId:
          transaction.details?.transferId ||
          transaction.referenceNumber,
        paidAt: new Date().toISOString(),
      },
    }
  );

  // Create Payment Log
  await strapi.entityService.create(
    "api::payment-log.payment-log",
    {
      data: {
        transactionId:
          transaction.details?.transferId ||
          transaction.referenceNumber,
        amount: transaction.amount.value,
        currency: transaction.amount.currency,
        paymentMethod: "WISE",
        status: "SUCCESS",
        order: order.id,
      },
    }
  );

  return {
    success: true,
    order,
    transaction,
  };
}
}
export const wiseService = new WiseService();
export default wiseService;
