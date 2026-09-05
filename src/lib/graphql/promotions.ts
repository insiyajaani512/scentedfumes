export const APPLY_COUPON_MUTATION = `
  mutation ApplyCoupon($code: String!) {
    applyCoupon(input: { code: $code }) {
      cart {
        appliedCoupons {
          code
        }
        subtotal
        total
        discountTotal
      }
    }
  }
`;

export const GET_CART_TOTALS_QUERY = `
  query GetCartTotals {
    cart {
      subtotal
      total
      discountTotal
      appliedCoupons {
        code
      }
    }
  }
`;
