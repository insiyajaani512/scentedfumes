import {
  cacheExchange,
  createClient,
  fetchExchange,
} from "urql";

/*
 * ---------------------------------------------------------
 * GRAPHQL ENDPOINT
 * ---------------------------------------------------------
 *
 * IMPORTANT:
 * The default must be the WordPress/WooCommerce backend,
 * NOT the frontend Vercel website.
 */

const graphqlEndpoint =
  process.env.NEXT_PUBLIC_WORDPRESS_API_URL ||
  process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT ||
  "https://backend.scentedfumes.com/graphql";

const isServer =
  typeof window === "undefined";

/*
 * ---------------------------------------------------------
 * WOOCOMMERCE SESSION TOKEN
 * ---------------------------------------------------------
 */

function getSessionToken():
  | string
  | null {
  /*
   * localStorage does not exist
   * during server-side rendering.
   */

  if (isServer) {
    return null;
  }

  return localStorage.getItem(
    "woo-session"
  );
}

export function setSessionToken(
  token: string
) {
  /*
   * Do nothing on the server.
   */

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
    url: graphqlEndpoint,

    /*
     * Always fetch fresh data during
     * server-side rendering/build.
     */

    requestPolicy:
      isServer
        ? "network-only"
        : "cache-first",

    /*
     * WooCommerce session handling.
     */

    fetchOptions: () => {
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

    /*
     * Server uses fetch directly.
     * Browser uses cache + fetch.
     */

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
