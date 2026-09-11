import { NextRequest, NextResponse } from "next/server";
import { APPLY_COUPON_MUTATION } from "@/lib/graphql/promotions";
import type { GiftSetPromotionCode } from "@/lib/store/cartStore";

const GRAPHQL_ENDPOINT =
  process.env.NEXT_PUBLIC_WORDPRESS_API_URL ||
  "https://backend.scentedfumes.com/graphql";

const EMPTY_CART_MUTATION = `
  mutation EmptyCart {
    emptyCart(input: {}) {
      cart {
        isEmpty
      }
    }
  }
`;

const ADD_TO_CART_MUTATION = `
  mutation AddToCart($productId: Int!, $quantity: Int!) {
    addToCart(input: { productId: $productId, quantity: $quantity }) {
      cart {
        contents {
          itemCount
        }
      }
    }
  }
`;

const CHECKOUT_MUTATION = `
  mutation Checkout(
    $paymentMethod: String!
    $billing: CustomerAddressInput!
    $shipping: CustomerAddressInput!
    $shipToDifferentAddress: Boolean
    $customerNote: String
  ) {
    checkout(input: {
      paymentMethod: $paymentMethod
      billing: $billing
      shipping: $shipping
      shipToDifferentAddress: $shipToDifferentAddress
      customerNote: $customerNote
      isPaid: false
    }) {
      order {
        databaseId
        orderNumber
        total
        status
      }
      result
      redirect
    }
  }
`;

const CART_TOTALS_QUERY = `
  query CartTotals {
    cart {
      subtotal
      discountTotal
      total
      appliedCoupons {
        code
        discountType
        amount
      }
    }
  }
`;

type PromotionPayload = {
  code: GiftSetPromotionCode;
  selections: number[];
  label: string;
};

function getCouponCodeForPromotion(
  code: GiftSetPromotionCode
): string | null {
  const env = process.env;

  switch (code) {
    case "gift_3_eco":
      return env.NEXT_PUBLIC_GIFTSET_COUPON_GIFT3ECO ?? null;

    case "gift_3_pro":
      return env.NEXT_PUBLIC_GIFTSET_COUPON_GIFT3PRO ?? null;

    case "pro_half_eco":
      return env.NEXT_PUBLIC_GIFTSET_COUPON_PRO50ECO ?? null;

    case "pro_half_testers":
      return env.NEXT_PUBLIC_GIFTSET_COUPON_PRO50TESTERS ?? null;

    default:
      return null;
  }
}

function validatePromotionPayload(
  promotion: PromotionPayload,
  cartItems: Array<{ productId: number; quantity: number }>
) {
  const selectionIds = promotion.selections ?? [];

  const uniqueSelectionCount = new Set(selectionIds).size;

  if (uniqueSelectionCount !== selectionIds.length) {
    return {
      ok: false,
      message: "Invalid promotion selection (duplicate items).",
    };
  }

  const cartIdSet = new Set(
    cartItems.map((it) => it.productId)
  );

  for (const id of selectionIds) {
    if (!cartIdSet.has(id)) {
      return {
        ok: false,
        message:
          "Invalid promotion selection (items do not match cart).",
      };
    }
  }

  const expectedSelectionCount =
    promotion.code === "gift_3_eco"
      ? 3
      : promotion.code === "gift_3_pro"
        ? 3
        : promotion.code === "pro_half_eco"
          ? 2
          : promotion.code === "pro_half_testers"
            ? 2
            : 0;

  if (selectionIds.length !== expectedSelectionCount) {
    return {
      ok: false,
      message:
        "Invalid promotion selection (wrong number of items).",
    };
  }

  return { ok: true as const };
}

function extractNumericAmount(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

async function graphqlRequest(
  query: string,
  variables: any = {},
  sessionToken?: string
) {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (sessionToken) {
    headers["woocommerce-session"] =
      `Session ${sessionToken}`;
  }

  const response = await fetch(
    GRAPHQL_ENDPOINT,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        variables,
      }),
      cache: "no-store",
    }
  );

  const result = await response.json();

  const newSessionToken =
    response.headers.get("woocommerce-session");

  return {
    data: result,
    sessionToken: newSessionToken,
  };
}

/**
 * Apply manually entered WooCommerce coupon.
 *
 * Returns the ACTUAL cart discount calculated by WooCommerce.
 */
async function handleManualCoupon(
  couponCode: string
) {
  const cleanCode =
    couponCode.trim();

  if (!cleanCode) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Please enter a promo code.",
      },
      { status: 400 }
    );
  }

  /*
   * Apply coupon
   */
  const applyResult =
    await graphqlRequest(
      APPLY_COUPON_MUTATION,
      {
        code: cleanCode,
      }
    );

  if (applyResult.data.errors) {
    console.error(
      "Manual coupon errors:",
      applyResult.data.errors
    );

    const message =
      applyResult.data.errors
        .map(
          (error: any) =>
            error?.message
        )
        .filter(Boolean)
        .join(" ") ||
      "Invalid promo code.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 400 }
    );
  }

  const cart =
    applyResult.data?.data
      ?.applyCoupon?.cart;

  const appliedCoupons =
    cart?.appliedCoupons || [];

  const applied =
    appliedCoupons.some(
      (coupon: any) =>
        String(
          coupon?.code || ""
        ).toLowerCase() ===
        cleanCode.toLowerCase()
    );

  if (!applied) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This promo code could not be applied.",
      },
      { status: 400 }
    );
  }

  /*
   * Get actual totals from WooCommerce.
   */
  let totalsCart = cart;

  /*
   * If totals are not included in applyCoupon response,
   * request the cart totals separately.
   */
  if (
    !totalsCart ||
    typeof totalsCart.discountTotal ===
      "undefined"
  ) {
    const totalsResult =
      await graphqlRequest(
        CART_TOTALS_QUERY,
        {},
        applyResult.sessionToken
      );

    if (
      !totalsResult.data.errors
    ) {
      totalsCart =
        totalsResult.data?.data
          ?.cart;
    }
  }

  const discountAmount =
    extractNumericAmount(
      totalsCart?.discountTotal
    );

  const subtotal =
    extractNumericAmount(
      totalsCart?.subtotal
    );

  const total =
    extractNumericAmount(
      totalsCart?.total
    );

  const matchedCoupon =
    appliedCoupons.find(
      (coupon: any) =>
        String(
          coupon?.code || ""
        ).toLowerCase() ===
        cleanCode.toLowerCase()
    );

  return NextResponse.json({
    success: true,

    code:
      cleanCode.toUpperCase(),

    message:
      "Promo code applied successfully.",

    discountAmount,

    subtotal,

    total,

    discountType:
      matchedCoupon?.discountType ||
      null,

    couponAmount:
      extractNumericAmount(
        matchedCoupon?.amount
      ),
  });
}

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      await request.json();

    const action =
      body?.action ||
      "checkout";

    /*
     * MANUAL COUPON
     */
    if (
      action ===
      "apply-coupon"
    ) {
      return await handleManualCoupon(
        String(
          body?.couponCode || ""
        )
      );
    }

    /*
     * NORMAL CHECKOUT
     */

    const {
      checkoutInput,
      cartItems,
      promotion,
      promoCode,
    } = body as {
      checkoutInput: any;
      cartItems: Array<{
        productId: number;
        quantity: number;
      }>;
      promotion?:
        | PromotionPayload
        | null;
      promoCode?:
        | string
        | null;
    };

    if (
      !Array.isArray(
        cartItems
      ) ||
      cartItems.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Your cart is empty.",
        },
        { status: 400 }
      );
    }

    let sessionToken:
      | string
      | undefined;

    /*
     * Step 1:
     * Empty WooCommerce cart
     */

    const emptyResult =
      await graphqlRequest(
        EMPTY_CART_MUTATION,
        {},
        sessionToken
      );

    if (
      emptyResult.sessionToken
    ) {
      sessionToken =
        emptyResult.sessionToken;
    }

    /*
     * Step 2:
     * Add products
     */

    for (
      const item of cartItems
    ) {
      if (
        !item.productId ||
        item.productId <= 0 ||
        !item.quantity ||
        item.quantity <= 0
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid cart item.",
          },
          { status: 400 }
        );
      }

      const addResult =
        await graphqlRequest(
          ADD_TO_CART_MUTATION,
          {
            productId:
              item.productId,

            quantity:
              item.quantity,
          },
          sessionToken
        );

      if (
        addResult.sessionToken
      ) {
        sessionToken =
          addResult.sessionToken;
      }

      if (
        addResult.data.errors
      ) {
        console.error(
          "Add to cart errors:",
          addResult.data.errors
        );

        return NextResponse.json(
          {
            error:
              `Failed to add product ${item.productId}.`,
          },
          {
            status: 400,
          }
        );
      }
    }

    /*
     * Step 3A:
     * Gift promotions
     */

    if (promotion) {
      const validation =
        validatePromotionPayload(
          promotion,
          cartItems
        );

      if (!validation.ok) {
        return NextResponse.json(
          {
            error:
              validation.message,
          },
          {
            status: 400,
          }
        );
      }

      const couponCode =
        getCouponCodeForPromotion(
          promotion.code
        );

      if (couponCode) {
        const applyResult =
          await graphqlRequest(
            APPLY_COUPON_MUTATION,
            {
              code:
                couponCode,
            },
            sessionToken
          );

        if (
          applyResult.sessionToken
        ) {
          sessionToken =
            applyResult.sessionToken;
        }
      }

      checkoutInput.customerNote =
        (
          checkoutInput.customerNote ||
          ""
        ) +
        `\n\n[SYSTEM] OFFER APPLIED: ${promotion.label}`;
    }

    /*
     * Step 3B:
     * Manual promo code
     */

    if (
      promoCode &&
      promoCode.trim()
    ) {
      const cleanPromoCode =
        promoCode.trim();

      const applyResult =
        await graphqlRequest(
          APPLY_COUPON_MUTATION,
          {
            code:
              cleanPromoCode,
          },
          sessionToken
        );

      if (
        applyResult.sessionToken
      ) {
        sessionToken =
          applyResult.sessionToken;
      }

      if (
        applyResult.data.errors
      ) {
        return NextResponse.json(
          {
            error:
              applyResult.data.errors
                .map(
                  (error: any) =>
                    error?.message
                )
                .filter(Boolean)
                .join(" ") ||
              "The promo code is invalid.",
          },
          {
            status: 400,
          }
        );
      }

      const appliedCoupons =
        applyResult.data?.data
          ?.applyCoupon?.cart
          ?.appliedCoupons || [];

      const applied =
        appliedCoupons.some(
          (coupon: any) =>
            String(
              coupon?.code || ""
            ).toLowerCase() ===
            cleanPromoCode.toLowerCase()
        );

      if (!applied) {
        return NextResponse.json(
          {
            error:
              "The promo code could not be applied to this order.",
          },
          {
            status: 400,
          }
        );
      }

      checkoutInput.customerNote =
        (
          checkoutInput.customerNote ||
          ""
        ) +
        `\n\n[SYSTEM] MANUAL PROMO CODE: ${cleanPromoCode.toUpperCase()}`;
    }

    /*
     * Step 4:
     * Checkout
     */

    const checkoutResult =
      await graphqlRequest(
        CHECKOUT_MUTATION,
        {
          paymentMethod:
            checkoutInput.paymentMethod,

          billing:
            checkoutInput.billing,

          shipping:
            checkoutInput.shipping,

          shipToDifferentAddress:
            checkoutInput.shipToDifferentAddress,

          customerNote:
            checkoutInput.customerNote ||
            null,
        },
        sessionToken
      );

    if (
      checkoutResult.data.errors
    ) {
      console.error(
        "Checkout errors:",
        checkoutResult.data.errors
      );

      return NextResponse.json(
        {
          error:
            "Checkout failed.",
          details:
            checkoutResult.data.errors,
        },
        {
          status: 400,
        }
      );
    }

    if (
      !checkoutResult.data.data
        ?.checkout
    ) {
      return NextResponse.json(
        {
          error:
            "Checkout failed - no response data.",
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json({
      success: true,

      checkout:
        checkoutResult.data.data
          .checkout,
    });
  } catch (error: any) {
    console.error(
      "API checkout error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Checkout processing failed.",

        message:
          error?.message,
      },
      {
        status: 500,
      }
    );
  }
}
