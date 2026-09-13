import {
  cacheExchange,
  createClient,
  fetchExchange,
} from "urql";

/*
 * WordPress / WooCommerce GraphQL endpoint.
 *
 * Priority:
 * 1. Vercel environment variable
 * 2. Alternative environment variable
 * 3. Backend fallback URL
 */

const graphqlEndpoint =
  process.env
    .NEXT_PUBLIC_WORDPRESS_API_URL ??
  process.env
    .NEXT_PUBLIC_GRAPHQL_ENDPOINT ??
  "https://backend.scentedfumes.com/graphql";

const isServer =
  typeof window === "undefined";

/*
 * ---------------------------------------------------------
 * WOOCOMMERCE SESSION
 * ---------------------------------------------------------
 */

function getSessionToken():
  | string
  | null {
  if (isServer) {
    return null;
  }

  return localStorage.getItem(
    "woo-session"
  );
}

function setSessionToken(
  token: string
) {
  if (isServer) {
    return;
  }

  localStorage.setItem(
    "woo-session",
    token
  );
}

/*
 * ---------------------------------------------------------
 * GRAPHQL CLIENT
 * ---------------------------------------------------------
 */

export const graphqlClient =
  createClient({
    url:
      graphqlEndpoint,

    requestPolicy:
      isServer
        ? "network-only"
        : "cache-first",

    fetchOptions:
      () => {
        const sessionToken =
          getSessionToken();

        return {
          credentials:
            "include",

          headers: {
            "content-type":
              "application/json",

            ...(sessionToken
              ? {
                  "woocommerce-session":
                    `Session ${sessionToken}`,
                }
              : {}),
          },
        };
      },

    exchanges:
      isServer
        ? [
            fetchExchange,
          ]
        : [
            cacheExchange,
            fetchExchange,
          ],
  });

/*
 * Export session setter
 * for WooCommerce cart/session handling.
 */

export {
  setSessionToken,
};
