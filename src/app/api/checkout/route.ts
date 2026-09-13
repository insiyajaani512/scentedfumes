import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  APPLY_COUPON_MUTATION,
} from "@/lib/graphql/promotions";

import type {
  GiftSetPromotionCode,
} from "@/lib/store/cartStore";

const GRAPHQL_ENDPOINT =
  process.env.NEXT_PUBLIC_WORDPRESS_API_URL ||
  process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT ||
  "https://backend.scentedfumes.com/graphql";

/*
 * ---------------------------------------------------------
 * EMPTY CART
 * ---------------------------------------------------------
 */

const EMPTY_CART_MUTATION = `
  mutation EmptyCart {
    emptyCart(input: {}) {
      cart {
        isEmpty
      }
    }
  }
`;

/*
 * ---------------------------------------------------------
 * ADD PRODUCT TO CART
 * ---------------------------------------------------------
 */

const ADD_TO_CART_MUTATION = `
  mutation AddToCart(
    $productId: Int!
    $quantity: Int!
  ) {
    addToCart(
      input: {
        productId: $productId
        quantity: $quantity
      }
    ) {
      cart {
        contents {
          itemCount
        }
      }
    }
  }
`;

/*
 * ---------------------------------------------------------
 * CART TOTALS
 * ---------------------------------------------------------
 */

const CART_TOTALS_QUERY = `
  query CartTotals {
    cart {
      subtotal
      discountTotal
      total

      appliedCoupons {
        code
      }
    }
  }
`;

/*
 * ---------------------------------------------------------
 * CHECKOUT
 * ---------------------------------------------------------
 */

const CHECKOUT_MUTATION = `
  mutation Checkout(
    $paymentMethod: String!
    $billing: CustomerAddressInput!
    $shipping: CustomerAddressInput!
    $shipToDifferentAddress: Boolean
    $customerNote: String
  ) {
    checkout(
      input: {
        paymentMethod: $paymentMethod
        billing: $billing
        shipping: $shipping
        shipToDifferentAddress: $shipToDifferentAddress
        customerNote: $customerNote
        isPaid: false
      }
    ) {
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

/*
 * ---------------------------------------------------------
 * TYPES
 * ---------------------------------------------------------
 */

type PromotionPayload = {
  code:
    GiftSetPromotionCode;

  selections:
    number[];

  label:
    string;
};

type ApiCartItem = {
  productId:
    number;

  quantity:
    number;
};

/*
 * ---------------------------------------------------------
 * GET PROMOTION COUPON
 * ---------------------------------------------------------
 */

function getCouponCodeForPromotion(
  code:
    GiftSetPromotionCode
): string | null {
  const env =
    process.env;

  switch (
    code
  ) {
    case "gift_3_eco":
      return (
        env.NEXT_PUBLIC_GIFTSET_COUPON_GIFT3ECO ??
        null
      );

    case "gift_3_pro":
      return (
        env.NEXT_PUBLIC_GIFTSET_COUPON_GIFT3PRO ??
        null
      );

    case "pro_half_eco":
      return (
        env.NEXT_PUBLIC_GIFTSET_COUPON_PRO50ECO ??
        null
      );

    case "pro_half_testers":
      return (
        env.NEXT_PUBLIC_GIFTSET_COUPON_PRO50TESTERS ??
        null
      );

    default:
      return null;
  }
}

/*
 * ---------------------------------------------------------
 * VALIDATE PROMOTION
 * ---------------------------------------------------------
 */

function validatePromotionPayload(
  promotion:
    PromotionPayload,

  cartItems:
    ApiCartItem[]
) {
  const selectionIds =
    promotion.selections ??
    [];

  const uniqueSelectionCount =
    new Set(
      selectionIds
    ).size;

  if (
    uniqueSelectionCount !==
    selectionIds.length
  ) {
    return {
      ok:
        false,

      message:
        "Invalid promotion selection (duplicate items).",
    };
  }

  const cartIdSet =
    new Set(
      cartItems.map(
        (
          item
        ) =>
          item.productId
      )
    );

  for (
    const id of
    selectionIds
  ) {
    if (
      !cartIdSet.has(
        id
      )
    ) {
      return {
        ok:
          false,

        message:
          "Invalid promotion selection (items do not match cart).",
      };
    }
  }

  const expectedSelectionCount =
    promotion.code ===
    "gift_3_eco"
      ? 3
      : promotion.code ===
          "gift_3_pro"
        ? 3
        : promotion.code ===
            "pro_half_eco"
          ? 2
          : promotion.code ===
              "pro_half_testers"
            ? 2
            : 0;

  if (
    selectionIds.length !==
    expectedSelectionCount
  ) {
    return {
      ok:
        false,

      message:
        "Invalid promotion selection (wrong number of items).",
    };
  }

  return {
    ok:
      true as const,
  };
}

/*
 * ---------------------------------------------------------
 * GRAPHQL REQUEST
 * ---------------------------------------------------------
 */

async function graphqlRequest(
  query:
    string,

  variables:
    any =
      {},

  sessionToken?:
    string
) {
  const headers:
    HeadersInit = {
      "Content-Type":
        "application/json",
    };

  if (
    sessionToken
  ) {
    headers[
      "woocommerce-session"
    ] =
      `Session ${sessionToken}`;
  }

  const response =
    await fetch(
      GRAPHQL_ENDPOINT,
      {
        method:
          "POST",

        headers,

        body:
          JSON.stringify(
            {
              query,

              variables,
            }
          ),

        cache:
          "no-store",
      }
    );

  const text =
    await response.text();

  let result:
    any;

  try {
    result =
      JSON.parse(
        text
      );
  } catch {
    throw new Error(
      `Invalid GraphQL response: ${response.status} ${response.statusText}`
    );
  }

  const newSessionToken =
    response.headers.get(
      "woocommerce-session"
    );

  return {
    data:
      result,

    sessionToken:
      newSessionToken ??
      sessionToken,
  };
}

/*
 * ---------------------------------------------------------
 * PARSE WOOCOMMERCE AMOUNT
 * ---------------------------------------------------------
 */

function parseWooCommerceAmount(
  value:
    any
): number {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return 0;
  }

  /*
   * WooGraphQL may return:
   *
   * "Rs 1,500"
   * "1500"
   * "1,500.00"
   */

  const cleaned =
    String(
      value
    )
      .replace(
        /[^0-9.-]/g,
        ""
      )
      .trim();

  const amount =
    Number(
      cleaned
    );

  return Number.isFinite(
    amount
  )
    ? amount
    : 0;
}

/*
 * ---------------------------------------------------------
 * REBUILD WOOCOMMERCE CART
 * ---------------------------------------------------------
 *
 * IMPORTANT:
 *
 * This function ensures that the coupon is applied
 * to the SAME products that exist in the frontend cart.
 */

async function rebuildCart(
  cartItems:
    ApiCartItem[]
) {
  let sessionToken:
    | string
    | undefined;

  /*
   * Empty cart
   */

  const emptyResult =
    await graphqlRequest(
      EMPTY_CART_MUTATION,
      {},
      sessionToken
    );

  sessionToken =
    emptyResult.sessionToken;

  /*
   * Add every product
   */

  for (
    const item of
    cartItems
  ) {
    if (
      !item.productId ||
      item.productId <= 0 ||
      !item.quantity ||
      item.quantity <= 0
    ) {
      throw new Error(
        "Invalid cart item."
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

    sessionToken =
      addResult.sessionToken;

    if (
      addResult.data
        ?.errors
        ?.length
    ) {
      const message =
        addResult.data.errors
          .map(
            (
              error:
                any
            ) =>
              error?.message
          )
          .filter(
            Boolean
          )
          .join(
            " "
          );

      throw new Error(
        message ||
        `Failed to add product ${item.productId}.`
      );
    }
  }

  return sessionToken;
}

/*
 * ---------------------------------------------------------
 * APPLY MANUAL COUPON
 * ---------------------------------------------------------
 */

async function handleManualCoupon(
  couponCode:
    string,

  cartItems:
    ApiCartItem[]
) {
  const cleanCode =
    couponCode.trim();

  if (
    !cleanCode
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          "Please enter a promo code.",
      },
      {
        status:
          400,
      }
    );
  }

  if (
    !Array.isArray(
      cartItems
    ) ||
    cartItems.length ===
      0
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          "Your cart is empty.",
      },
      {
        status:
          400,
      }
    );
  }

  try {
    /*
     * STEP 1
     *
     * Build the actual WooCommerce cart
     */

    const sessionToken =
      await rebuildCart(
        cartItems
      );

    /*
     * STEP 2
     *
     * Apply coupon
     */

    const applyResult =
      await graphqlRequest(
        APPLY_COUPON_MUTATION,
        {
          code:
            cleanCode,
        },
        sessionToken
      );

    const currentSession =
      applyResult.sessionToken ??
      sessionToken;

    if (
      applyResult.data
        ?.errors
        ?.length
    ) {
      const message =
        applyResult.data.errors
          .map(
            (
              error:
                any
            ) =>
              error?.message
          )
          .filter(
            Boolean
          )
          .join(
            " "
          );

      return NextResponse.json(
        {
          success:
            false,

          error:
            message ||
            "Invalid promo code.",
        },
        {
          status:
            400,
        }
      );
    }

    /*
     * STEP 3
     *
     * Get updated WooCommerce totals
     */

    const cartTotalsResult =
      await graphqlRequest(
        CART_TOTALS_QUERY,
        {},
        currentSession
      );

    if (
      cartTotalsResult.data
        ?.errors
        ?.length
    ) {
      console.error(
        "Cart totals errors:",
        cartTotalsResult.data.errors
      );

      return NextResponse.json(
        {
          success:
            false,

          error:
            "Unable to calculate promo discount.",
        },
        {
          status:
            400,
        }
      );
    }

    const cart =
      cartTotalsResult
        .data
        ?.data
        ?.cart;

    if (
      !cart
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Unable to retrieve cart totals.",
        },
        {
          status:
            400,
        }
      );
    }

    const subtotal =
      parseWooCommerceAmount(
        cart.subtotal
      );

    const discount =
      parseWooCommerceAmount(
        cart.discountTotal
      );

    const total =
      parseWooCommerceAmount(
        cart.total
      );

    /*
     * STEP 4
     *
     * Return EXACT discount to frontend
     */

    return NextResponse.json(
      {
        success:
          true,

        code:
          cleanCode.toUpperCase(),

        message:
          "Promo code applied successfully.",

        /*
         * IMPORTANT
         *
         * Checkout.tsx uses this value.
         */

        discountAmount:
          discount,

        discount,

        subtotal,

        total,

        totals:
          {
            subtotal,

            discount,

            total,
          },
      }
    );
  } catch (
    error:
      any
  ) {
    console.error(
      "Manual coupon error:",
      error
    );

    return NextResponse.json(
      {
        success:
          false,

        error:
          error?.message ||
          "Unable to apply promo code.",
      },
      {
        status:
          500,
        }
    );
  }
}

/*
 * ---------------------------------------------------------
 * POST API
 * ---------------------------------------------------------
 */

export async function POST(
  request:
    NextRequest
) {
  try {
    const body =
      await request.json();

    const action =
      body?.action ||
      "checkout";

    /*
     * -----------------------------------------------------
     * APPLY COUPON
     * -----------------------------------------------------
     */

    if (
      action ===
      "apply-coupon"
    ) {
      return await handleManualCoupon(
        String(
          body?.couponCode ||
          ""
        ),

        Array.isArray(
          body?.cartItems
        )
          ? body.cartItems
          : []
      );
    }

    /*
     * -----------------------------------------------------
     * NORMAL CHECKOUT
     * -----------------------------------------------------
     */

    const {
      checkoutInput,

      cartItems,

      promotion,

      promoCode,
    } =
      body as {
        checkoutInput:
          any;

        cartItems:
          ApiCartItem[];

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
      cartItems.length ===
        0
    ) {
      return NextResponse.json(
        {
          error:
            "Your cart is empty.",
        },
        {
          status:
            400,
        }
      );
    }

    /*
     * -----------------------------------------------------
     * STEP 1
     *
     * Rebuild WooCommerce cart
     * -----------------------------------------------------
     */

    let sessionToken =
      await rebuildCart(
        cartItems
      );

    /*
     * -----------------------------------------------------
     * STEP 2
     *
     * APPLY GIFT SET PROMOTION
     * -----------------------------------------------------
     */

    if (
      promotion
    ) {
      const validation =
        validatePromotionPayload(
          promotion,
          cartItems
        );

      if (
        !validation.ok
      ) {
        return NextResponse.json(
          {
            error:
              validation.message,
          },
          {
            status:
              400,
          }
        );
      }

      const couponCode =
        getCouponCodeForPromotion(
          promotion.code
        );

      let systemNote =
        `\n\n[SYSTEM] OFFER APPLIED: ${promotion.label}`;

      if (
        !couponCode
      ) {
        console.warn(
          `Coupon code for ${promotion.code} is not configured.`
        );

        systemNote +=
          "\n- WARNING: Promotion coupon is not configured.";
      } else {
        const applyResult =
          await graphqlRequest(
            APPLY_COUPON_MUTATION,
            {
              code:
                couponCode,
            },
            sessionToken
          );

        sessionToken =
          applyResult.sessionToken ??
          sessionToken;

        if (
          applyResult.data
            ?.errors
            ?.length
        ) {
          console.error(
            "Promotion coupon errors:",
            applyResult.data.errors
          );

          systemNote +=
            "\n- WARNING: Promotion coupon could not be applied.";
        }
      }

      checkoutInput.customerNote =
        (
          checkoutInput.customerNote ||
          ""
        ) +
        systemNote;
    }

    /*
     * -----------------------------------------------------
     * STEP 3
     *
     * APPLY MANUAL PROMO CODE
     * -----------------------------------------------------
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

      sessionToken =
        applyResult.sessionToken ??
        sessionToken;

      if (
        applyResult.data
          ?.errors
          ?.length
      ) {
        const message =
          applyResult.data.errors
            .map(
              (
                error:
                  any
              ) =>
                error?.message
            )
            .filter(
              Boolean
            )
            .join(
              " "
            );

        return NextResponse.json(
          {
            error:
              message ||
              "The promo code is invalid or cannot be applied.",
          },
          {
            status:
              400,
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
     * -----------------------------------------------------
     * STEP 4
     *
     * CHECKOUT
     * -----------------------------------------------------
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
      checkoutResult.data
        ?.errors
        ?.length
    ) {
      console.error(
        "Checkout errors:",
        checkoutResult.data.errors
      );

      const message =
        checkoutResult.data.errors
          .map(
            (
              error:
                any
            ) =>
              error?.message
          )
          .filter(
            Boolean
          )
          .join(
            " "
          );

      return NextResponse.json(
        {
          error:
            message ||
            "Checkout failed.",

          details:
            checkoutResult.data.errors,
        },
        {
          status:
            400,
        }
      );
    }

    const checkout =
      checkoutResult.data
        ?.data
        ?.checkout;

    if (
      !checkout
    ) {
      return NextResponse.json(
        {
          error:
            "Checkout failed - no response data.",
        },
        {
          status:
            400,
        }
      );
    }

    return NextResponse.json(
      {
        success:
          true,

        checkout,
      }
    );
  } catch (
    error:
      any
  ) {
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
        status:
          500,
        }
    );
  }
}
