async function handleCouponUsageReduction(orderResult: any) {
  try {
    if (!orderResult) return;

    const filterList: any[] = [];
    if (orderResult.documentId) filterList.push({ documentId: orderResult.documentId });
    if (orderResult.id) filterList.push({ id: orderResult.id });
    if (orderResult.orderNumber) filterList.push({ orderNumber: orderResult.orderNumber });

    if (filterList.length === 0) return;

    // Fetch order with populated coupon relation
    const order = await strapi.documents("api::order.order").findFirst({
      filters: {
        $or: filterList,
      },
      populate: ["coupon"],
    });

    if (!order || !order.coupon) {
      return;
    }

    const couponRef = order.coupon;
    const couponFilter: any[] = [];
    if (couponRef.documentId) couponFilter.push({ documentId: couponRef.documentId });
    if (couponRef.id) couponFilter.push({ id: couponRef.id });

    if (couponFilter.length === 0) return;

    const couponRecord = await strapi.documents("api::coupon.coupon").findFirst({
      filters: {
        $or: couponFilter,
      },
    });

    if (!couponRecord) return;

    const updateData: any = {
      usedCount: (couponRecord.usedCount || 0) + 1,
    };

    if (
      couponRecord.maxUses !== null &&
      couponRecord.maxUses !== undefined
    ) {
      const currentMaxUses = Number(couponRecord.maxUses);
      const newMaxUses = Math.max(0, currentMaxUses - 1);
      updateData.maxUses = newMaxUses;
      if (newMaxUses === 0) {
        updateData.isActive = false;
        strapi.log.info(
          `[Coupon Lifecycle] Coupon ${couponRecord.code} reached 0 maxUses. Marked as inactive.`
        );
      }
    }

    await strapi.documents("api::coupon.coupon").update({
      documentId: couponRecord.documentId,
      data: updateData,
      status: "published",
    });

    strapi.log.info(
      `[Coupon Lifecycle] Successfully reduced maxUses for coupon ${couponRecord.code}. Remaining maxUses: ${updateData.maxUses ?? "unlimited"}, Used count: ${updateData.usedCount}`
    );
  } catch (error) {
    strapi.log.error("[Coupon Lifecycle Error] Failed to reduce coupon maxUses:", error);
  }
}

export default {
  async beforeUpdate(event: any) {
    const { params } = event;
    if (params?.data?.paymentStatus === "paid") {
      try {
        const existing = await strapi.db.query("api::order.order").findOne({
          where: params.where,
          populate: ["coupon"],
        });
        event.state = {
          wasNotPaid: !existing || existing.paymentStatus !== "paid",
        };
      } catch (e) {
        event.state = { wasNotPaid: true };
      }
    }
  },

  async afterUpdate(event: any) {
    const { result, state, params } = event;
    const isPaid =
      result?.paymentStatus === "paid" || params?.data?.paymentStatus === "paid";

    if (state?.wasNotPaid && isPaid) {
      await handleCouponUsageReduction(result);
    }
  },

  async afterCreate(event: any) {
    const { result } = event;
    if (result?.paymentStatus === "paid") {
      await handleCouponUsageReduction(result);
    }
  },
};
