/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as callActions from "../callActions.js";
import type * as callResults from "../callResults.js";
import type * as calls from "../calls.js";
import type * as claims from "../claims.js";
import type * as dashboard from "../dashboard.js";
import type * as http from "../http.js";
import type * as insuranceContacts from "../insuranceContacts.js";
import type * as patients from "../patients.js";
import type * as providers from "../providers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  callActions: typeof callActions;
  callResults: typeof callResults;
  calls: typeof calls;
  claims: typeof claims;
  dashboard: typeof dashboard;
  http: typeof http;
  insuranceContacts: typeof insuranceContacts;
  patients: typeof patients;
  providers: typeof providers;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
