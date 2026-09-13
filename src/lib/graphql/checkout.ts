import {
  CheckoutInput,
  CartItem,
} from "@/types/checkout";

import type {
  CartPromotion,
} from "@/lib/store/cartStore";

/*
 * ---------------------------------------------------------
 * MANUAL COUPON RESULT
 * ---------------------------------------------------------
 */

export type ManualCouponResult = {
  success:
    boolean;

  code?:
    string;

  message?:
    string;

  discountAmount?:
    number;

  /*
   * Keep this as fallback because
   * the API may also return "discount".
   */

  discount?:
    number;

  subtotal?:
    number;

  total?:
    number;

  discountType?:
    string | null;

  couponAmount?:
    number;
};

/*
 * ---------------------------------------------------------
 * APPLY MANUAL COUPON
 * ---------------------------------------------------------
 */

export async function applyManualCoupon(
  code:
    string
): Promise<
  ManualCouponResult
> {
  const cleanCode =
    code.trim();

  if (
    !cleanCode
  ) {
    return {
      success:
        false,

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

          headers:
            {
              "Content-Type":
                "application/json",
            },

          body:
            JSON.stringify(
              {
                action:
                  "apply-coupon",

                couponCode:
                  cleanCode,
              }
            ),
        }
      );

    const result =
      await response.json();

    if (
      !response.ok ||
      !result.success
    ) {
      return {
        success:
          false,

        message:
          result.error ||
          result.message ||
          "Invalid promo code.",
      };
    }

    /*
     * -----------------------------------------------------
     * IMPORTANT FIX
     * -----------------------------------------------------
     *
     * Prefer:
     *
     * result.discountAmount
     *
     * But also support:
     *
     * result.discount
     *
     * This ensures the checkout page always
     * receives the correct discount.
     */

    const actualDiscount =
      Number(
        result.discountAmount ??
        result.discount ??
        result.totals?.discount ??
        0
      );

    return {
      success:
        true,

      code:
        result.code ||
        cleanCode
          .toUpperCase(),

      message:
        result.message ||
        "Promo code applied successfully.",

      /*
       * IMPORTANT:
       * This is what CheckoutForm uses.
       */

      discountAmount:
        actualDiscount,

      discount:
        actualDiscount,

      subtotal:
        Number(
          result.subtotal ??
          result.totals?.subtotal ??
          0
        ),

      total:
        Number(
          result.total ??
          result.totals?.total ??
          0
        ),

      discountType:
        result.discountType ||
        null,

      couponAmount:
        Number(
          result.couponAmount ||
          0
        ),
    };
  } catch (
    error:
      any
  ) {
    console.error(
      "Promo code error:",
      error
    );

    return {
      success:
        false,

      message:
        error
          ?.message ||
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
  input:
    CheckoutInput,

  cartItems:
    CartItem[],

  promotion:
    | CartPromotion
    | null =
      null,

  promoCode:
    | string
    | null =
      null
) {
  try {
    const response =
      await fetch(
        "/api/checkout",
        {
          method:
            "POST",

          headers:
            {
              "Content-Type":
                "application/json",
            },

          body:
            JSON.stringify(
              {
                action:
                  "checkout",

                checkoutInput:
                  input,

                cartItems,

                promotion,

                promoCode:
                  promoCode
                    ?.trim() ||
                  null,
              }
            ),
        }
      );

    const result =
      await response.json();

    if (
      !response.ok
    ) {
      console.error(
        "Checkout API error:",
        result
      );

      throw new Error(
        result.error ||
        result.message ||
        "Checkout failed"
      );
    }

    if (
      !result.success ||
      !result.checkout
    ) {
      throw new Error(
        result.error ||
        result.message ||
        "Checkout failed - invalid response"
      );
    }

    return result.checkout;
  } catch (
    error:
      any
  ) {
    console.error(
      "Checkout process error:",
      error
    );

    throw error;
  }
}
