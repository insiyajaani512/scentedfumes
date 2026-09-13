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
 * =========================================================
 * EMPTY WOOCOMMERCE CART
 * =========================================================
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
 * =========================================================
 * ADD PRODUCT TO CART
 * =========================================================
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
 * =========================================================
 * CART TOTALS
 * =========================================================
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
 * =========================================================
 * CHECKOUT
 * =========================================================
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
 * =========================================================
 * TYPES
 * =========================================================
 */

type PromotionPayload = {
  code:
    GiftSetPromotionCode;

  selections:
    number[];

  label:
    string;
};

type SimpleCartItem = {
  productId:
    number;

  quantity:
    number;
};

/*
 * =========================================================
 * GET COUPON CODE FOR PROMOTION
 * =========================================================
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
        env
          .NEXT_PUBLIC_GIFTSET_COUPON_GIFT3ECO ??
        null
      );

    case "gift_3_pro":
      return (
        env
          .NEXT_PUBLIC_GIFTSET_COUPON_GIFT3PRO ??
        null
      );

    case "pro_half_eco":
      return (
        env
          .NEXT_PUBLIC_GIFTSET_COUPON_PRO50ECO ??
        null
      );

    case "pro_half_testers":
      return (
        env
          .NEXT_PUBLIC_GIFTSET_COUPON_PRO50TESTERS ??
        null
      );

    default:
      return null;
  }
}

/*
 * =========================================================
 * VALIDATE PROMOTION
 * =========================================================
 */

function validatePromotionPayload(
  promotion:
    PromotionPayload,

  cartItems:
    SimpleCartItem[]
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
 * =========================================================
 * GRAPHQL REQUEST
 * =========================================================
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
          JSON.stringify({
            query,
            variables,
          }),

        credentials:
          "include",

        cache:
          "no-store",
      }
    );

  const result =
    await response.json();

  const newSessionToken =
    response.headers.get(
      "woocommerce-session"
    );

  return {
    data:
      result,

    sessionToken:
      newSessionToken,
  };
}

/*
 * =========================================================
 * PARSE WOOCOMMERCE AMOUNT
 * =========================================================
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
 * =========================================================
 * MANUAL COUPON
 * =========================================================
 *
 * This creates a temporary WooCommerce cart:
 *
 * 1. Empty cart
 * 2. Add frontend products
 * 3. Apply coupon
 * 4. Get actual WooCommerce discount
 * 5. Return discount to checkout page
 */

async function handleManualCoupon(
  couponCode:
    string,

  cartItems:
    SimpleCartItem[]
) {
  const cleanCode =
    couponCode.trim();

  /*
   * VALIDATE CODE
   */

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

  /*
   * VALIDATE CART
   */

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

  let sessionToken:
    | string
    | undefined;

  /*
   * ---------------------------------------------------------
   * STEP 1
   *
   * EMPTY CART
   * ---------------------------------------------------------
   */

  const emptyResult =
    await graphqlRequest(
      EMPTY_CART_MUTATION,
      {},
      sessionToken
    );

  if (
    emptyResult
      .sessionToken
  ) {
    sessionToken =
      emptyResult
        .sessionToken;
  }

  /*
   * ---------------------------------------------------------
   * STEP 2
   *
   * ADD ACTUAL FRONTEND PRODUCTS
   * ---------------------------------------------------------
   */

  for (
    const item of
    cartItems
  ) {
    if (
      !item.productId ||
      item.productId <=
        0 ||
      !item.quantity ||
      item.quantity <=
        0
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Invalid cart item.",
        },
        {
          status:
            400,
        }
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
      addResult
        .sessionToken
    ) {
      sessionToken =
        addResult
          .sessionToken;
    }

    if (
      addResult
        .data
        ?.errors
    ) {
      console.error(
        "Coupon cart add error:",
        addResult
          .data
          .errors
      );

      return NextResponse.json(
        {
          success:
            false,

          error:
            "Unable to prepare cart for promo code.",
        },
        {
          status:
            400,
          }
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * STEP 3
   *
   * GET CART BEFORE COUPON
   * ---------------------------------------------------------
   */

  const beforeCouponResult =
    await graphqlRequest(
      CART_TOTALS_QUERY,
      {},
      sessionToken
    );

  if (
    beforeCouponResult
      .sessionToken
  ) {
    sessionToken =
      beforeCouponResult
        .sessionToken;
  }

  const cartBeforeCoupon =
    beforeCouponResult
      .data
      ?.data
      ?.cart ||
    null;

  const subtotal =
    parseWooCommerceAmount(
      cartBeforeCoupon
        ?.subtotal
    );

  /*
   * ---------------------------------------------------------
   * STEP 4
   *
   * APPLY COUPON
   * ---------------------------------------------------------
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

  if (
    applyResult
      .sessionToken
  ) {
    sessionToken =
      applyResult
        .sessionToken;
  }

  if (
    applyResult
      .data
      ?.errors
  ) {
    console.error(
      "Manual coupon errors:",
      applyResult
        .data
        .errors
    );

    const message =
      applyResult
        .data
        .errors
        .map(
          (
            error:
              any
          ) =>
            error
              ?.message
        )
        .filter(
          Boolean
        )
        .join(
          " "
        ) ||
      "Invalid promo code.";

    return NextResponse.json(
      {
        success:
          false,

        error:
          message,
      },
      {
        status:
          400,
      }
    );
  }

  /*
   * ---------------------------------------------------------
   * STEP 5
   *
   * VERIFY COUPON
   * ---------------------------------------------------------
   */

  const appliedCoupons =
    applyResult
      .data
      ?.data
      ?.applyCoupon
      ?.cart
      ?.appliedCoupons ||
    [];

  const applied =
    appliedCoupons.some(
      (
        coupon:
          any
      ) =>
        String(
          coupon
            ?.code ||
            ""
        )
          .toLowerCase() ===
        cleanCode
          .toLowerCase()
    );

  if (
    !applied
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          "This promo code could not be applied.",
      },
      {
        status:
          400,
      }
    );
  }

  /*
   * ---------------------------------------------------------
   * STEP 6
   *
   * GET UPDATED CART TOTALS
   * ---------------------------------------------------------
   */

  const cartTotalsResult =
    await graphqlRequest(
      CART_TOTALS_QUERY,
      {},
      sessionToken
    );

  if (
    cartTotalsResult
      .sessionToken
  ) {
    sessionToken =
      cartTotalsResult
        .sessionToken;
  }

  const cart =
    cartTotalsResult
      .data
      ?.data
      ?.cart ||
    applyResult
      .data
      ?.data
      ?.applyCoupon
      ?.cart ||
    null;

  /*
   * ---------------------------------------------------------
   * ACTUAL WOO DISCOUNT
   * ---------------------------------------------------------
   */

  const discount =
    parseWooCommerceAmount(
      cart
        ?.discountTotal
    );

  const total =
    parseWooCommerceAmount(
      cart
        ?.total
    );

  /*
   * ---------------------------------------------------------
   * RETURN RESULT
   * ---------------------------------------------------------
   */

  return NextResponse.json(
    {
      success:
        true,

      code:
        cleanCode
          .toUpperCase(),

      message:
        "Promo code applied successfully.",

      subtotal,

      /*
       * CheckoutForm uses this value.
       */

      discountAmount:
        discount,

      discount,

      total,

      totals:
        {
          subtotal,

          discount,

          total,
        },
    }
  );
}

/*
 * =========================================================
 * POST API
 * =========================================================
 */

export async function POST(
  request:
    NextRequest
) {
  try {
    const body =
      await request.json();

    const action =
      body
        ?.action ||
      "checkout";

    /*
     * =========================================================
     * APPLY MANUAL COUPON
     * =========================================================
     */

    if (
      action ===
      "apply-coupon"
    ) {
      /*
       * IMPORTANT:
       *
       * cartItems are now received
       * from CheckoutForm.
       */

      return await handleManualCoupon(
        String(
          body
            ?.couponCode ||
            ""
        ),

        Array.isArray(
          body
            ?.cartItems
        )
          ? body
              .cartItems
          : []
      );
    }

    /*
     * =========================================================
     * NORMAL CHECKOUT
     * =========================================================
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
          SimpleCartItem[];

        promotion?:
          | PromotionPayload
          | null;

        promoCode?:
          | string
          | null;
      };

    /*
     * VALIDATE CART
     */

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

    let sessionToken:
      | string
      | undefined;

    /*
     * =========================================================
     * STEP 1
     *
     * EMPTY CART
     * =========================================================
     */

    const emptyResult =
      await graphqlRequest(
        EMPTY_CART_MUTATION,
        {},
        sessionToken
      );

    if (
      emptyResult
        .sessionToken
    ) {
      sessionToken =
        emptyResult
          .sessionToken;
    }

    if (
      emptyResult
        .data
        ?.errors
    ) {
      const isEmptyError =
        emptyResult
          .data
          .errors
          .some(
            (
              error:
                any
            ) =>
              error
                ?.message
                ?.toLowerCase()
                .includes(
                  "cart is empty"
                )
          );

      if (
        !isEmptyError
      ) {
        console.error(
          "Empty cart errors:",
          emptyResult
            .data
            .errors
        );
      }
    }

    /*
     * =========================================================
     * STEP 2
     *
     * ADD PRODUCTS
     * =========================================================
     */

    for (
      const item of
      cartItems
    ) {
      if (
        !item.productId ||
        item.productId <=
          0 ||
        !item.quantity ||
        item.quantity <=
          0
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid cart item.",
          },
          {
            status:
              400,
          }
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
        addResult
          .sessionToken
      ) {
        sessionToken =
          addResult
            .sessionToken;
      }

      if (
        addResult
          .data
          ?.errors
      ) {
        console.error(
          "Add to cart errors:",
          addResult
            .data
            .errors
        );

        return NextResponse.json(
          {
            error:
              `Failed to add product ${item.productId}.`,

            details:
              addResult
                .data
                .errors,
          },
          {
            status:
              400,
          }
        );
      }
    }

    /*
     * =========================================================
     * STEP 3A
     *
     * GIFT SET PROMOTION
     * =========================================================
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
              validation
                .message,
          },
          {
            status:
              400,
          }
        );
      }

      const couponCode =
        getCouponCodeForPromotion(
          promotion
            .code
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

        if (
          applyResult
            .sessionToken
        ) {
          sessionToken =
            applyResult
              .sessionToken;
        }

        if (
          applyResult
            .data
            ?.errors
        ) {
          console.error(
            "Promotion coupon errors:",
            applyResult
              .data
              .errors
          );

          systemNote +=
            "\n- WARNING: Promotion coupon could not be applied.";
        }
      }

      checkoutInput.customerNote =
        (
          checkoutInput
            .customerNote ||
          ""
        ) +
        systemNote;
    }

    /*
     * =========================================================
     * STEP 3B
     *
     * MANUAL PROMO CODE
     * =========================================================
     */

    if (
      promoCode &&
      promoCode
        .trim()
    ) {
      const cleanPromoCode =
        promoCode
          .trim();

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
        applyResult
          .sessionToken
      ) {
        sessionToken =
          applyResult
            .sessionToken;
      }

      if (
        applyResult
          .data
          ?.errors
      ) {
        console.error(
          "Manual promo coupon errors:",
          applyResult
            .data
            .errors
        );

        return NextResponse.json(
          {
            error:
              applyResult
                .data
                .errors
                .map(
                  (
                    error:
                      any
                  ) =>
                    error
                      ?.message
                )
                .filter(
                  Boolean
                )
                .join(
                  " "
                ) ||
              "The promo code is invalid or cannot be applied.",
          },
          {
            status:
              400,
          }
        );
      }

      const appliedCoupons =
        applyResult
          .data
          ?.data
          ?.applyCoupon
          ?.cart
          ?.appliedCoupons ||
        [];

      const applied =
        appliedCoupons.some(
          (
            coupon:
              any
          ) =>
            String(
              coupon
                ?.code ||
                ""
            )
              .toLowerCase() ===
            cleanPromoCode
              .toLowerCase()
        );

      if (
        !applied
      ) {
        return NextResponse.json(
          {
            error:
              "The promo code could not be applied to this order.",
          },
          {
            status:
              400,
          }
        );
      }

      checkoutInput.customerNote =
        (
          checkoutInput
            .customerNote ||
          ""
        ) +
        `\n\n[SYSTEM] MANUAL PROMO CODE: ${cleanPromoCode.toUpperCase()}`;
    }

    /*
     * =========================================================
     * STEP 4
     *
     * CHECKOUT
     * =========================================================
     */

    const checkoutResult =
      await graphqlRequest(
        CHECKOUT_MUTATION,
        {
          paymentMethod:
            checkoutInput
              .paymentMethod,

          billing:
            checkoutInput
              .billing,

          shipping:
            checkoutInput
              .shipping,

          shipToDifferentAddress:
            checkoutInput
              .shipToDifferentAddress,

          customerNote:
            checkoutInput
              .customerNote ||
            null,
        },
        sessionToken
      );

    if (
      checkoutResult
        .data
        ?.errors
    ) {
      console.error(
        "Checkout errors:",
        checkoutResult
          .data
          .errors
      );

      return NextResponse.json(
        {
          error:
            "Checkout failed.",

          details:
            checkoutResult
              .data
              .errors,
        },
        {
          status:
            400,
        }
      );
    }

    if (
      !checkoutResult
        .data
        .data
        ?.checkout
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

    /*
     * =========================================================
     * SUCCESS
     * =========================================================
     */

    return NextResponse.json(
      {
        success:
          true,

        checkout:
          checkoutResult
            .data
            .data
            .checkout,
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
          error
            ?.message,
      },
      {
        status:
          500,
      }
    );
  }
}
