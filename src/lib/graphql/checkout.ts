import {
  CheckoutInput,
  CartItem,
} from "@/types/checkout";

import type {
  CartPromotion,
} from "@/lib/store/cartStore";

/*
 * ---------------------------------------------------------
 * TYPES
 * ---------------------------------------------------------
 */

export type ManualCouponResult = {
  success: boolean;

  code?: string;

  message?: string;

  /*
   * Actual calculated discount in PKR
   */
  discountAmount?: number;

  /*
   * Fallback discount field
   */
  discount?: number;

  subtotal?: number;

  total?: number;

  discountType?: string | null;

  couponAmount?: number;
};

/*
 * ---------------------------------------------------------
 * HELPER
 * ---------------------------------------------------------
 *
 * Convert any API value safely into a number.
 */

function toNumber(
  value: unknown
): number {
  const numberValue =
    Number(value);

  return Number.isFinite(
    numberValue
  )
    ? numberValue
    : 0;
}

/*
 * ---------------------------------------------------------
 * APPLY MANUAL COUPON
 * ---------------------------------------------------------
 */

export async function applyManualCoupon(
  code: string
): Promise<ManualCouponResult> {
  const cleanCode =
    code.trim();

  if (!cleanCode) {
    return {
      success: false,

      message:
        "Please enter a promo code.",
    };
  }

  try {
    const response =
      await fetch(
        "/api/checkout",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              action:
                "apply-coupon",

              couponCode:
                cleanCode,
            }),
        }
      );

    let result: any;

    try {
      result =
        await response.json();
    } catch {
      throw new Error(
        "Invalid response from server."
      );
    }

    if (
      !response.ok ||
      !result?.success
    ) {
      return {
        success: false,

        message:
          result?.error ||
          result?.message ||
          "Invalid promo code.",
      };
    }

    /*
     * -----------------------------------------------------
     * GET ACTUAL DISCOUNT
     * -----------------------------------------------------
     *
     * Support multiple possible API response formats.
     */

    const actualDiscount =
      toNumber(
        result.discountAmount ??
          result.discount ??
          result.totals?.discount ??
          result.totals?.discountAmount ??
          result.cart?.discount ??
          0
      );

    /*
     * -----------------------------------------------------
     * GET SUBTOTAL
     * -----------------------------------------------------
     */

    const subtotal =
      toNumber(
        result.subtotal ??
          result.totals?.subtotal ??
          result.cart?.subtotal ??
          0
      );

    /*
     * -----------------------------------------------------
     * GET TOTAL
     * -----------------------------------------------------
     */

    const total =
      toNumber(
        result.total ??
          result.totals?.total ??
          result.cart?.total ??
          0
      );

    return {
      success: true,

      code:
        result.code ||
        result.couponCode ||
        cleanCode.toUpperCase(),

      message:
        result.message ||
        "Promo code applied successfully.",

      /*
       * IMPORTANT
       *
       * CheckoutForm reads discountAmount.
       */

      discountAmount:
        actualDiscount,

      /*
       * Keep duplicate fallback.
       */

      discount:
        actualDiscount,

      subtotal,

      total,

      discountType:
        result.discountType ??
        result.coupon?.discountType ??
        null,

      couponAmount:
        toNumber(
          result.couponAmount ??
            result.coupon?.amount ??
            0
        ),
    };
  } catch (
    error: any
  ) {
    console.error(
      "Promo code error:",
      error
    );

    return {
      success: false,

      message:
        error?.message ||
        "Unable to validate the promo code. Please try again.",
    };
  }
}

/*
 * ---------------------------------------------------------
 * PROCESS CHECKOUT
 * ---------------------------------------------------------
 */

export async function processCheckout(
  input: CheckoutInput,

  cartItems: CartItem[],

  promotion:
    | CartPromotion
    | null = null,

  promoCode:
    | string
    | null = null
) {
  try {
    const response =
      await fetch(
        "/api/checkout",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              action:
                "checkout",

              checkoutInput:
                input,

              cartItems,

              promotion,

              promoCode:
                promoCode?.trim() ||
                null,
            }),
        }
      );

    let result: any;

    try {
      result =
        await response.json();
    } catch {
      throw new Error(
        "Invalid response from checkout server."
      );
    }

    if (!response.ok) {
      console.error(
        "Checkout API error:",
        result
      );

      throw new Error(
        result?.error ||
          result?.message ||
          "Checkout failed"
      );
    }

    if (
      !result?.success ||
      !result?.checkout
    ) {
      console.error(
        "Invalid checkout response:",
        result
      );

      throw new Error(
        result?.error ||
          result?.message ||
          "Checkout failed - invalid response"
      );
    }

    return result.checkout;
  } catch (
    error: any
  ) {
    console.error(
      "Checkout process error:",
      error
    );

    throw error;
  }
}
