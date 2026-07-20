/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiKeys from "../apiKeys.js";
import type * as auditEvents from "../auditEvents.js";
import type * as callActions from "../callActions.js";
import type * as callEvents from "../callEvents.js";
import type * as callResults from "../callResults.js";
import type * as callSessions from "../callSessions.js";
import type * as calls from "../calls.js";
import type * as claimImport from "../claimImport.js";
import type * as claims from "../claims.js";
import type * as dashboard from "../dashboard.js";
import type * as demoMetrics from "../demoMetrics.js";
import type * as dentalCallActions from "../dentalCallActions.js";
import type * as dentalCases from "../dentalCases.js";
import type * as dentalImport from "../dentalImport.js";
import type * as dentalPlans from "../dentalPlans.js";
import type * as devSeed from "../devSeed.js";
import type * as evResults from "../evResults.js";
import type * as handoff from "../handoff.js";
import type * as http from "../http.js";
import type * as insuranceContacts from "../insuranceContacts.js";
import type * as lib_specializations from "../lib/specializations.js";
import type * as operatorStats from "../operatorStats.js";
import type * as outcomeClassifier from "../outcomeClassifier.js";
import type * as patients from "../patients.js";
import type * as prompts_dentalEv from "../prompts/dentalEv.js";
import type * as prompts_index from "../prompts/index.js";
import type * as prompts_ivrContext from "../prompts/ivrContext.js";
import type * as prompts_ivrOnlyMode from "../prompts/ivrOnlyMode.js";
import type * as prompts_medicalClaim from "../prompts/medicalClaim.js";
import type * as prompts_multiPatientHandoff from "../prompts/multiPatientHandoff.js";
import type * as prompts_transferTrigger from "../prompts/transferTrigger.js";
import type * as prompts_voiceIvrNavigation from "../prompts/voiceIvrNavigation.js";
import type * as providers from "../providers.js";
import type * as reports from "../reports.js";
import type * as seedProdMirror from "../seedProdMirror.js";
import type * as transferDestinations from "../transferDestinations.js";
import type * as userGroups from "../userGroups.js";
import type * as users from "../users.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiKeys: typeof apiKeys;
  auditEvents: typeof auditEvents;
  callActions: typeof callActions;
  callEvents: typeof callEvents;
  callResults: typeof callResults;
  callSessions: typeof callSessions;
  calls: typeof calls;
  claimImport: typeof claimImport;
  claims: typeof claims;
  dashboard: typeof dashboard;
  demoMetrics: typeof demoMetrics;
  dentalCallActions: typeof dentalCallActions;
  dentalCases: typeof dentalCases;
  dentalImport: typeof dentalImport;
  dentalPlans: typeof dentalPlans;
  devSeed: typeof devSeed;
  evResults: typeof evResults;
  handoff: typeof handoff;
  http: typeof http;
  insuranceContacts: typeof insuranceContacts;
  "lib/specializations": typeof lib_specializations;
  operatorStats: typeof operatorStats;
  outcomeClassifier: typeof outcomeClassifier;
  patients: typeof patients;
  "prompts/dentalEv": typeof prompts_dentalEv;
  "prompts/index": typeof prompts_index;
  "prompts/ivrContext": typeof prompts_ivrContext;
  "prompts/ivrOnlyMode": typeof prompts_ivrOnlyMode;
  "prompts/medicalClaim": typeof prompts_medicalClaim;
  "prompts/multiPatientHandoff": typeof prompts_multiPatientHandoff;
  "prompts/transferTrigger": typeof prompts_transferTrigger;
  "prompts/voiceIvrNavigation": typeof prompts_voiceIvrNavigation;
  providers: typeof providers;
  reports: typeof reports;
  seedProdMirror: typeof seedProdMirror;
  transferDestinations: typeof transferDestinations;
  userGroups: typeof userGroups;
  users: typeof users;
  webhooks: typeof webhooks;
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
