#!/usr/bin/env node
import{createRequire as __cr}from'module';const require=__cr(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf, __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require < "u" ? require : typeof Proxy < "u" ? new Proxy(x, {
  get: (a, b) => (typeof require < "u" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require < "u") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: !0 }) : target,
  mod
));

// ../../packages/realtime-contracts/index.cjs
var require_realtime_contracts = __commonJS({
  "../../packages/realtime-contracts/index.cjs"(exports, module) {
    "use strict";
    var __create2 = Object.create, __defProp2 = Object.defineProperty, __getOwnPropDesc2 = Object.getOwnPropertyDescriptor, __getOwnPropNames2 = Object.getOwnPropertyNames, __getProtoOf2 = Object.getPrototypeOf, __hasOwnProp2 = Object.prototype.hasOwnProperty, __export2 = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: !0 });
    }, __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from == "object" || typeof from == "function")
        for (let key of __getOwnPropNames2(from))
          !__hasOwnProp2.call(to, key) && key !== except && __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      return to;
    }, __toESM2 = (mod, isNodeMode, target) => (target = mod != null ? __create2(__getProtoOf2(mod)) : {}, __copyProps2(
      // If the importer is in node compatibility mode or this is not an ESM
      // file that has been converted to a CommonJS file using a Babel-
      // compatible transform (i.e. "__esModule" has not been set), then set
      // "default" to the CommonJS "module.exports" for node compatibility.
      isNodeMode || !mod || !mod.__esModule ? __defProp2(target, "default", { value: mod, enumerable: !0 }) : target,
      mod
    )), __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: !0 }), mod), index_exports = {};
    __export2(index_exports, {
      BOOTSTRAP_FALLBACK_REASONS: () => BOOTSTRAP_FALLBACK_REASONS,
      CAPABILITY_CHANGED_EVENT: () => CAPABILITY_CHANGED_EVENT,
      CAPABILITY_PUBLISH_MAX_EVENTS: () => CAPABILITY_PUBLISH_MAX_EVENTS,
      CAPABILITY_PUBLISH_REASONS: () => CAPABILITY_PUBLISH_REASONS,
      CHANGES_FALLBACK_REASONS: () => CHANGES_FALLBACK_REASONS,
      FAST_BOOTSTRAP_LOCAL_REASONS: () => FAST_BOOTSTRAP_LOCAL_REASONS,
      FAST_BOOTSTRAP_MODES: () => FAST_BOOTSTRAP_MODES2,
      FAST_BOOTSTRAP_PHASES: () => FAST_BOOTSTRAP_PHASES2,
      FAST_BOOTSTRAP_SEVERITIES: () => FAST_BOOTSTRAP_SEVERITIES2,
      FAST_BOOTSTRAP_STATUS_REASONS: () => FAST_BOOTSTRAP_STATUS_REASONS2,
      FAST_SYNC_BACKEND_REASONS: () => FAST_SYNC_BACKEND_REASONS,
      FAST_SYNC_FALLBACK_ACTIONS: () => FAST_SYNC_FALLBACK_ACTIONS,
      FAST_SYNC_FALLBACK_REASONS: () => FAST_SYNC_FALLBACK_REASONS,
      INVITATIONS_CHANGED_EVENT: () => INVITATIONS_CHANGED_EVENT,
      INVITATION_CHANGED_REASONS: () => INVITATION_CHANGED_REASONS,
      INVITATION_PUBLISH_MAX_EVENTS: () => INVITATION_PUBLISH_MAX_EVENTS,
      INVITATION_PUBLISH_PATH: () => INVITATION_PUBLISH_PATH,
      NOTIFICATIONS_CHANGED_EVENT: () => NOTIFICATIONS_CHANGED_EVENT,
      NOTIFICATION_CHANGED_REASONS: () => NOTIFICATION_CHANGED_REASONS,
      NOTIFICATION_PUBLISH_MAX_EVENTS: () => NOTIFICATION_PUBLISH_MAX_EVENTS,
      NOTIFICATION_PUBLISH_PATH: () => NOTIFICATION_PUBLISH_PATH,
      WS_SUBSCRIBE: () => WS_SUBSCRIBE,
      WS_SUBSCRIBED: () => WS_SUBSCRIBED,
      WS_UNSUBSCRIBE: () => WS_UNSUBSCRIBE,
      WS_UNSUBSCRIBED: () => WS_UNSUBSCRIBED,
      assertSafeTarEntryName: () => assertSafeTarEntryName,
      buildCapabilityChangedEvent: () => buildCapabilityChangedEvent,
      buildInvitationsChangedEvent: () => buildInvitationsChangedEvent,
      buildNotificationsChangedEvent: () => buildNotificationsChangedEvent,
      buildUserRoom: () => buildUserRoom,
      hasOnlyKeys: () => hasOnlyKeys,
      isBootstrapResponse: () => isBootstrapResponse2,
      isCapabilityChangedEvent: () => isCapabilityChangedEvent,
      isCapabilityPublishEvent: () => isCapabilityPublishEvent,
      isCapabilityPublishRequest: () => isCapabilityPublishRequest,
      isChangesResponse: () => isChangesResponse2,
      isFastBootstrapStatusReason: () => isFastBootstrapStatusReason,
      isFolderDeletedEvent: () => isFolderDeletedEvent,
      isInvitationPublishEvent: () => isInvitationPublishEvent,
      isInvitationPublishRequest: () => isInvitationPublishRequest,
      isInvitationsChangedEvent: () => isInvitationsChangedEvent,
      isMemoryChangedEvent: () => isMemoryChangedEvent,
      isNotificationPublishEvent: () => isNotificationPublishEvent,
      isNotificationPublishRequest: () => isNotificationPublishRequest,
      isNotificationsChangedEvent: () => isNotificationsChangedEvent,
      isPushBundleResult: () => isPushBundleResult2,
      isRevisionRecord: () => isRevisionRecord,
      isSafeSyncKey: () => isSafeSyncKey,
      isSnapshotManifest: () => isSnapshotManifest,
      isWsSubscribePayload: () => isWsSubscribePayload,
      isWsSubscribedAck: () => isWsSubscribedAck,
      makeCapabilityPublishEvent: () => makeCapabilityPublishEvent,
      makeInvitationPublishEvent: () => makeInvitationPublishEvent,
      makeNotificationPublishEvent: () => makeNotificationPublishEvent,
      makeRevisionRange: () => makeRevisionRange,
      requiresSpaceId: () => requiresSpaceId,
      requiresTeamId: () => requiresTeamId,
      zeroPadRevision: () => zeroPadRevision
    });
    module.exports = __toCommonJS(index_exports);
    var import_node_path43 = __toESM2(__require("node:path"), 1);
    function assertSafeTarEntryName(name, options = {}) {
      if (options.type && options.type !== "file")
        throw new Error("unsafe tar entry");
      if (name.includes("\\") || name.includes("\0") || import_node_path43.default.posix.isAbsolute(name))
        throw new Error("unsafe tar entry");
      let normalized = import_node_path43.default.posix.normalize(name);
      if (normalized === "." || normalized === ".." || normalized.startsWith("../"))
        throw new Error("unsafe tar entry");
      if (options.seen?.has(normalized)) throw new Error("duplicate tar entry");
      return normalized;
    }
    function isMemoryChangedEvent(value) {
      return !(!isRecord3(value) || typeof value.teamId != "string" || typeof value.spaceId != "string" || typeof value.key != "string" || typeof value.at != "string" || value.op !== "put" && value.op !== "delete" || value.md5 !== void 0 && typeof value.md5 != "string" || value.rev !== void 0 && !isRevisionNumber(value.rev) || value.prevRev !== void 0 && value.prevRev !== null && !isRevisionNumber(value.prevRev));
    }
    function isFolderDeletedEvent(value) {
      return !(!isRecord3(value) || typeof value.teamId != "string" || typeof value.spaceId != "string" || typeof value.prefix != "string" || typeof value.at != "string" || value.rev !== void 0 && !isRevisionNumber(value.rev) || value.prevRev !== void 0 && value.prevRev !== null && !isRevisionNumber(value.prevRev));
    }
    var CAPABILITY_CHANGED_EVENT = "capabilities.changed", INVITATIONS_CHANGED_EVENT = "invitations.changed", NOTIFICATIONS_CHANGED_EVENT = "notifications.changed", CAPABILITY_PUBLISH_MAX_EVENTS = 500, INVITATION_PUBLISH_MAX_EVENTS = 500, INVITATION_PUBLISH_PATH = "/internal/invitations", NOTIFICATION_PUBLISH_MAX_EVENTS = 100, NOTIFICATION_PUBLISH_PATH = "/internal/notifications", CAPABILITY_PUBLISH_REASONS = [
      "team_created",
      "team_updated",
      "team_deleted",
      "team_activation_changed",
      "billing_sync_state_changed",
      "space_created",
      "space_updated",
      "space_deleted",
      "space_archived",
      "membership_added",
      "membership_removed",
      "membership_role_changed",
      "membership_left",
      "ownership_transferred",
      "space_grant_added",
      "space_grant_changed",
      "space_grant_removed"
    ], INVITATION_CHANGED_REASONS = [
      "created",
      "revoked",
      "accepted",
      "rejected"
    ], NOTIFICATION_CHANGED_REASONS = [
      "created",
      "updated",
      "read",
      "archived"
    ], UUID_RE2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, reasons = new Set(CAPABILITY_PUBLISH_REASONS), invitationReasons = new Set(INVITATION_CHANGED_REASONS), notificationReasons = new Set(NOTIFICATION_CHANGED_REASONS);
    function buildUserRoom(userId) {
      if (!UUID_RE2.test(userId)) throw new Error("invalid user id");
      return `user:${userId}`;
    }
    function buildCapabilityChangedEvent(input) {
      return {
        ...input.capabilityVersion === void 0 ? {} : { capabilityVersion: input.capabilityVersion },
        at: input.at ?? (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    function makeCapabilityPublishEvent(input) {
      let raw = input;
      if (!isCapabilityPublishEvent(input))
        throw requiresSpaceId(raw.reason) && !raw.spaceId ? new Error("spaceId is required") : requiresTeamId(raw.reason) && !raw.teamId ? new Error("teamId is required") : new Error("invalid capability publish event");
      return input;
    }
    function isCapabilityChangedEvent(value) {
      return !(!isRecord3(value) || !Object.keys(value).every((key) => key === "capabilityVersion" || key === "at") || typeof value.at != "string" || Number.isNaN(Date.parse(value.at)) || "capabilityVersion" in value && !isNonNegativeSafeInteger(value.capabilityVersion));
    }
    function isCapabilityPublishRequest(value) {
      return !isRecord3(value) || !Array.isArray(value.events) || value.events.length === 0 || value.events.length > 500 ? !1 : value.events.every(isCapabilityPublishEvent);
    }
    function isCapabilityPublishEvent(value) {
      return !(!isRecord3(value) || typeof value.userId != "string" || !UUID_RE2.test(value.userId) || !isNonNegativeSafeInteger(value.capabilityVersion) || typeof value.reason != "string" || !reasons.has(value.reason) || "teamId" in value && !isOptionalUuid(value.teamId) || "spaceId" in value && !isOptionalUuid(value.spaceId) || requiresTeamId(value.reason) && typeof value.teamId != "string" || requiresSpaceId(value.reason) && typeof value.spaceId != "string");
    }
    function requiresTeamId(reason) {
      return reason !== "billing_sync_state_changed";
    }
    function requiresSpaceId(reason) {
      return reason === "space_created" || reason === "space_updated" || reason === "space_deleted" || reason === "space_archived" || reason === "space_grant_added" || reason === "space_grant_changed" || reason === "space_grant_removed";
    }
    function buildInvitationsChangedEvent(input) {
      return {
        reason: input.reason,
        at: input.at ?? (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    function makeInvitationPublishEvent(input) {
      if (!isInvitationPublishEvent(input))
        throw new Error("invalid invitation publish event");
      return input;
    }
    function isInvitationsChangedEvent(value) {
      return !(!isRecord3(value) || !Object.keys(value).every((key) => key === "reason" || key === "at") || typeof value.reason != "string" || !invitationReasons.has(value.reason) || typeof value.at != "string" || Number.isNaN(Date.parse(value.at)));
    }
    function isInvitationPublishRequest(value) {
      if (!isRecord3(value)) return !1;
      let keys = Object.keys(value);
      return keys.length !== 1 || keys[0] !== "events" || !Array.isArray(value.events) || value.events.length === 0 || value.events.length > INVITATION_PUBLISH_MAX_EVENTS ? !1 : value.events.every(isInvitationPublishEvent);
    }
    function isInvitationPublishEvent(value) {
      if (!isRecord3(value)) return !1;
      let keys = Object.keys(value), hasAt = "at" in value;
      if (hasAt) {
        if (!keys.every((key) => key === "userId" || key === "reason" || key === "at"))
          return !1;
      } else if (!keys.every((key) => key === "userId" || key === "reason"))
        return !1;
      return !(typeof value.userId != "string" || !UUID_RE2.test(value.userId) || typeof value.reason != "string" || !invitationReasons.has(value.reason) || hasAt && (typeof value.at != "string" || Number.isNaN(Date.parse(value.at))));
    }
    function buildNotificationsChangedEvent(input) {
      return {
        reason: input.reason,
        at: input.at ?? (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    function makeNotificationPublishEvent(input) {
      if (!isNotificationPublishEvent(input))
        throw new Error("invalid notification publish event");
      return input;
    }
    function isNotificationsChangedEvent(value) {
      return !(!isRecord3(value) || !Object.keys(value).every((key) => key === "reason" || key === "at") || typeof value.reason != "string" || !notificationReasons.has(value.reason) || typeof value.at != "string" || Number.isNaN(Date.parse(value.at)));
    }
    function isNotificationPublishRequest(value) {
      if (!isRecord3(value)) return !1;
      let keys = Object.keys(value);
      return keys.length !== 1 || keys[0] !== "events" || !Array.isArray(value.events) || value.events.length === 0 || value.events.length > NOTIFICATION_PUBLISH_MAX_EVENTS ? !1 : value.events.every(isNotificationPublishEvent);
    }
    function isNotificationPublishEvent(value) {
      if (!isRecord3(value)) return !1;
      let keys = Object.keys(value), hasAt = "at" in value;
      if (hasAt) {
        if (!keys.every((key) => key === "userId" || key === "reason" || key === "at"))
          return !1;
      } else if (!keys.every((key) => key === "userId" || key === "reason"))
        return !1;
      return !(typeof value.userId != "string" || !UUID_RE2.test(value.userId) || typeof value.reason != "string" || !notificationReasons.has(value.reason) || hasAt && (typeof value.at != "string" || Number.isNaN(Date.parse(value.at))));
    }
    function isRecord3(value) {
      return typeof value == "object" && value !== null && !Array.isArray(value);
    }
    function isOptionalUuid(value) {
      return value === void 0 || typeof value == "string" && UUID_RE2.test(value);
    }
    function isNonNegativeSafeInteger(value) {
      return typeof value == "number" && Number.isSafeInteger(value) && value >= 0;
    }
    var BOOTSTRAP_FALLBACK_REASONS = [
      "unsupported_layer",
      "snapshot_missing",
      "snapshot_stale",
      "snapshot_building",
      "snapshot_artifact_missing",
      "snapshot_corrupt",
      "unsafe_revision_log",
      "authz_denied"
    ], CHANGES_FALLBACK_REASONS = [
      "unsupported_layer",
      "revision_gap",
      "delta_too_large",
      "delta_body_too_large",
      "unsafe_revision_log",
      "authz_denied"
    ], FAST_SYNC_FALLBACK_REASONS = [
      ...BOOTSTRAP_FALLBACK_REASONS,
      ...CHANGES_FALLBACK_REASONS
    ], FAST_SYNC_FALLBACK_ACTIONS = [
      "legacy",
      "retry_bootstrap",
      "blocked"
    ], FAST_BOOTSTRAP_MODES2 = ["snapshot", "legacy"], FAST_SYNC_BACKEND_REASONS = [
      "unsupported_layer",
      "snapshot_missing",
      "snapshot_stale",
      "snapshot_building",
      "snapshot_artifact_missing",
      "snapshot_corrupt",
      "unsafe_revision_log",
      "authz_denied",
      "revision_gap",
      "delta_too_large",
      "delta_body_too_large"
    ], FAST_BOOTSTRAP_LOCAL_REASONS = [
      "dirty_local_tree",
      "snapshot_promote_pending",
      "bundle_handle_expired_or_mismatched",
      "bootstrap_transport_error",
      "bootstrap_contract_invalid",
      "worker_revoked",
      "too_many_syncable_spaces"
    ], FAST_BOOTSTRAP_STATUS_REASONS2 = [
      ...FAST_SYNC_BACKEND_REASONS,
      ...FAST_BOOTSTRAP_LOCAL_REASONS
    ];
    function isFastBootstrapStatusReason(value) {
      return typeof value == "string" && FAST_BOOTSTRAP_STATUS_REASONS2.includes(value);
    }
    var FAST_BOOTSTRAP_SEVERITIES2 = [
      "silent",
      "informational",
      "warning",
      "error"
    ], FAST_BOOTSTRAP_PHASES2 = [
      "idle",
      "checking_bootstrap",
      "snapshot_downloading",
      "snapshot_unpacking",
      "snapshot_verifying",
      "delta_applying",
      "tail_catching_up",
      "promoting",
      "baseline_seeding",
      "index_rebuilding",
      "ready",
      "legacy_bootstrap",
      "retry_waiting",
      "failed",
      "cancelled"
    ];
    function makeRevisionRange(fromRevExclusive, toRevInclusive) {
      if (!isRevisionCursor(fromRevExclusive) || !isRevisionNumber(toRevInclusive) || toRevInclusive < fromRevExclusive)
        throw new Error("invalid revision range");
      return { fromRevExclusive, toRevInclusive };
    }
    function zeroPadRevision(rev) {
      if (!isRevisionNumber(rev)) throw new Error("invalid revision");
      return String(rev).padStart(18, "0");
    }
    function isRevisionRecord(value) {
      if (!isRecord3(value) || !hasExactBaseKeys(value)) return !1;
      if (value.op === "put") {
        let putKeys = [
          "schemaVersion",
          "rev",
          "prevRev",
          "teamId",
          "spaceId",
          "requestId",
          "createdAt",
          "op",
          "entry",
          "objectGeneration",
          "contentSha256",
          ...value.body === void 0 ? [] : ["body"]
        ];
        return hasOnlyKeys(value, putKeys) && isManifestEntry(value.entry) && typeof value.objectGeneration == "string" && isSha256(value.contentSha256) && (value.body === void 0 || isInlineRevisionBody(value.body));
      }
      return value.op === "delete" ? hasOnlyKeys(value, [
        "schemaVersion",
        "rev",
        "prevRev",
        "teamId",
        "spaceId",
        "requestId",
        "createdAt",
        "op",
        "key"
      ]) && isSafeSyncKey(value.key) : value.op === "delete_folder" ? hasOnlyKeys(value, [
        "schemaVersion",
        "rev",
        "prevRev",
        "teamId",
        "spaceId",
        "requestId",
        "createdAt",
        "op",
        "deleteScope",
        "deletePrefix",
        "deletedKeys"
      ]) && value.deleteScope === "exact_keys" && isSafeSyncKey(value.deletePrefix) && Array.isArray(value.deletedKeys) && value.deletedKeys.every(isSafeSyncKey) && isSorted(value.deletedKeys) : !1;
    }
    function isBootstrapResponse2(value) {
      return isRecord3(value) ? value.kind === "snapshot" ? hasOnlyKeys(value, ["kind", "manifest", "currentRevision", "bundle"]) && isSnapshotManifest(value.manifest) && isRevisionCursor(value.currentRevision) && isRecord3(value.bundle) && hasOnlyKeys(value.bundle, ["kind", "handle"]) && value.bundle.kind === "backend-handle" && typeof value.bundle.handle == "string" && value.bundle.handle.length > 0 : value.kind === "fallback_required" ? isFallbackResponse(value, BOOTSTRAP_FALLBACK_REASONS, !0) : !1 : !1;
    }
    function isChangesResponse2(value) {
      return isRecord3(value) ? value.kind === "revision_list" ? hasOnlyKeys(value, [
        "kind",
        "fromRevExclusive",
        "toRevInclusive",
        "records"
      ]) && isRevisionCursor(value.fromRevExclusive) && isRevisionNumber(value.toRevInclusive) && value.toRevInclusive >= value.fromRevExclusive && Array.isArray(value.records) && value.records.every(isRevisionRecord) : value.kind === "fallback_required" ? isFallbackResponse(value, CHANGES_FALLBACK_REASONS, !1) : !1 : !1;
    }
    function isSnapshotManifest(value) {
      return isRecord3(value) && hasOnlyKeys(value, [
        "schemaVersion",
        "formatVersion",
        "teamId",
        "spaceId",
        "snapshotRevision",
        "createdAt",
        "fileCount",
        "totalBytes",
        "bundleSha256",
        "bundleByteCount",
        "objectGeneration",
        "manifestEntries"
      ]) && value.schemaVersion === 1 && value.formatVersion === "tar-gzip-v1" && typeof value.teamId == "string" && typeof value.spaceId == "string" && isRevisionCursor(value.snapshotRevision) && typeof value.createdAt == "string" && !Number.isNaN(Date.parse(value.createdAt)) && isNonNegativeSafeInteger(value.fileCount) && isNonNegativeSafeInteger(value.totalBytes) && isSha256(value.bundleSha256) && isNonNegativeSafeInteger(value.bundleByteCount) && typeof value.objectGeneration == "string" && Array.isArray(value.manifestEntries) && value.manifestEntries.every(isManifestEntry);
    }
    function isManifestEntry(value) {
      return isRecord3(value) && hasOnlyKeys(value, ["key", "md5", "size", "contentType", "updatedAt"]) && isSafeSyncKey(value.key) && typeof value.md5 == "string" && /^[0-9a-f]{32}$/.test(value.md5) && isNonNegativeSafeInteger(value.size) && typeof value.contentType == "string" && typeof value.updatedAt == "string" && !Number.isNaN(Date.parse(value.updatedAt));
    }
    function hasExactBaseKeys(value) {
      return value.schemaVersion === 1 && isRevisionNumber(value.rev) && (value.prevRev === null || isRevisionNumber(value.prevRev)) && typeof value.teamId == "string" && typeof value.spaceId == "string" && typeof value.requestId == "string" && typeof value.createdAt == "string" && !Number.isNaN(Date.parse(value.createdAt));
    }
    function hasOnlyKeys(value, keys) {
      let allowed = new Set(keys);
      return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => key in value);
    }
    function isRevisionNumber(value) {
      return typeof value == "number" && Number.isSafeInteger(value) && value > 0;
    }
    function isRevisionCursor(value) {
      return typeof value == "number" && Number.isSafeInteger(value) && value >= 0;
    }
    function isSha256(value) {
      return typeof value == "string" && /^[0-9a-f]{64}$/.test(value);
    }
    function isSafeSyncKey(value) {
      return !(typeof value != "string" || value.length === 0 || value.startsWith("/") || value.includes(".."));
    }
    function isSorted(values) {
      for (let i = 1; i < values.length; i += 1)
        if (values[i - 1].localeCompare(values[i]) > 0) return !1;
      return !0;
    }
    function isOneOf(value, allowed) {
      return typeof value == "string" && allowed.includes(value);
    }
    function isPositiveSafeInteger(value) {
      return typeof value == "number" && Number.isSafeInteger(value) && value > 0;
    }
    function isInlineRevisionBody(value) {
      return isRecord3(value) && hasOnlyKeys(value, ["kind", "base64"]) && value.kind === "inline-base64" && typeof value.base64 == "string" && value.base64.length > 0 && value.base64.length <= 4 * 1024 * 1024 && /^[A-Za-z0-9+/]*={0,2}$/.test(value.base64) && Buffer.from(value.base64, "base64").toString("base64") === value.base64;
    }
    function isFastSyncSpaceSizePolicy(value) {
      return isRecord3(value) && hasOnlyKeys(value, [
        "class",
        "fileCount",
        "totalBytes",
        "largeFileThreshold",
        "largeBytesThreshold"
      ]) && (value.class === "small" || value.class === "large") && isNonNegativeSafeInteger(value.fileCount) && isNonNegativeSafeInteger(value.totalBytes) && isPositiveSafeInteger(value.largeFileThreshold) && isPositiveSafeInteger(value.largeBytesThreshold);
    }
    function isFallbackResponse(value, allowedReasons, allowBootstrapMetadata) {
      if (!isOneOf(value.reason, allowedReasons) || !["legacy", "retry_bootstrap", "blocked"].includes(String(value.fallback)) || value.fallback === "legacy" && value.legacyAllowed !== !0 || value.fallback !== "legacy" && value.legacyAllowed !== !1 || value.fallback === "legacy" && Object.prototype.hasOwnProperty.call(value, "retryAfterMs") || value.fallback === "retry_bootstrap" && !isPositiveSafeInteger(value.retryAfterMs) || value.fallback === "blocked" && value.retryAfterMs !== void 0 && !isPositiveSafeInteger(value.retryAfterMs))
        return !1;
      if (value.reason === "unsupported_layer" || value.reason === "authz_denied")
        return hasOnlyKeys(value, [
          "kind",
          "reason",
          "fallback",
          "legacyAllowed",
          ...value.retryAfterMs === void 0 ? [] : ["retryAfterMs"]
        ]);
      let bootstrapMetadataKeys = [
        ...value.spaceSizePolicy === void 0 ? [] : ["spaceSizePolicy"],
        ...value.currentRevision === void 0 ? [] : ["currentRevision"],
        ...value.snapshotRevision === void 0 ? [] : ["snapshotRevision"],
        ...value.maxCatchupRecords === void 0 ? [] : ["maxCatchupRecords"]
      ];
      return value.spaceSizePolicy !== void 0 && !isFastSyncSpaceSizePolicy(value.spaceSizePolicy) || value.currentRevision !== void 0 && !isRevisionCursor(value.currentRevision) || value.snapshotRevision !== void 0 && !isRevisionNumber(value.snapshotRevision) || value.maxCatchupRecords !== void 0 && !isPositiveSafeInteger(value.maxCatchupRecords) ? !1 : hasOnlyKeys(value, [
        "kind",
        "reason",
        "fallback",
        "legacyAllowed",
        ...value.retryAfterMs === void 0 ? [] : ["retryAfterMs"],
        ...allowBootstrapMetadata ? bootstrapMetadataKeys : []
      ]);
    }
    var WS_SUBSCRIBE = "subscribe", WS_UNSUBSCRIBE = "unsubscribe", WS_SUBSCRIBED = "subscribed", WS_UNSUBSCRIBED = "unsubscribed";
    function isWsSubscribePayload(value) {
      return isRecord3(value) ? typeof value.teamId == "string" && typeof value.spaceId == "string" : !1;
    }
    function isWsSubscribedAck(value) {
      return !(!isRecord3(value) || typeof value.teamId != "string" || typeof value.spaceId != "string" || typeof value.ok != "boolean" || value.ok === !1 && value.reason !== "denied" && value.reason !== "stale" && value.reason !== "error");
    }
    function isPushBundleResult2(value) {
      return !isRecord3(value) || !hasOnlyKeys(value, ["revision", "files"]) || !isRevisionNumber(value.revision) || !Array.isArray(value.files) ? !1 : value.files.every(
        (f) => isRecord3(f) && hasOnlyKeys(f, ["key", "md5", "updatedAt"]) && isSafeSyncKey(f.key) && typeof f.md5 == "string" && /^[0-9a-f]{32}$/.test(f.md5) && typeof f.updatedAt == "string" && !Number.isNaN(Date.parse(f.updatedAt))
      );
    }
  }
});

// src/commands.ts
import { randomUUID as randomUUID8 } from "node:crypto";
import { existsSync as existsSync4, readFileSync as readFileSync2 } from "node:fs";
import { mkdir as mkdir20, readdir as readdir8, readFile as readFile27, rm as rm18, stat as stat8 } from "node:fs/promises";
import { basename as basename5, dirname as dirname14, join as join29, resolve as resolve10, sep as sep7 } from "node:path";

// ../../packages/core/src/render/element-types.ts
var ELEMENT_NAMES = [
  "bv-topic",
  "bv-reason",
  "bv-task",
  "bv-changes",
  "bv-files",
  "bv-flow",
  "bv-timestamp",
  "bv-author",
  "bv-pattern",
  "bv-structure",
  "bv-dependencies",
  "bv-highlights",
  "bv-rule",
  "bv-examples",
  "bv-diagram",
  "bv-fact",
  "bv-decision",
  "bv-bug",
  "bv-fix"
];

// ../../packages/core/src/render/elements/make-validator.ts
function makeAttributeValidator(tagName, schema2) {
  return (node) => {
    if (node.tagName !== tagName)
      return { errors: [
        {
          field: "tagName",
          message: `expected tagName "${tagName}", got "${node.tagName}"`
        }
      ], valid: !1 };
    let parsed = schema2.safeParse(node.attributes);
    return parsed.success ? { valid: !0 } : { errors: parsed.error.issues.map((issue) => ({
      field: issue.path.join(".") || "attributes",
      message: issue.message
    })), valid: !1 };
  };
}

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever, util2.arrayToEnum = (items) => {
    let obj = {};
    for (let item of items)
      obj[item] = item;
    return obj;
  }, util2.getValidEnumValues = (obj) => {
    let validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] != "number"), filtered = {};
    for (let k of validKeys)
      filtered[k] = obj[k];
    return util2.objectValues(filtered);
  }, util2.objectValues = (obj) => util2.objectKeys(obj).map(function(e) {
    return obj[e];
  }), util2.objectKeys = typeof Object.keys == "function" ? (obj) => Object.keys(obj) : (object) => {
    let keys = [];
    for (let key in object)
      Object.prototype.hasOwnProperty.call(object, key) && keys.push(key);
    return keys;
  }, util2.find = (arr, checker) => {
    for (let item of arr)
      if (checker(item))
        return item;
  }, util2.isInteger = typeof Number.isInteger == "function" ? (val) => Number.isInteger(val) : (val) => typeof val == "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val == "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues, util2.jsonStringifyReplacer = (_, value) => typeof value == "bigint" ? value.toString() : value;
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => ({
    ...first,
    ...second
    // second overwrites first
  });
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]), getParsedType = (data) => {
  switch (typeof data) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      return Array.isArray(data) ? ZodParsedType.array : data === null ? ZodParsedType.null : data.then && typeof data.then == "function" && data.catch && typeof data.catch == "function" ? ZodParsedType.promise : typeof Map < "u" && data instanceof Map ? ZodParsedType.map : typeof Set < "u" && data instanceof Set ? ZodParsedType.set : typeof Date < "u" && data instanceof Date ? ZodParsedType.date : ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]), quotelessJson = (obj) => JSON.stringify(obj, null, 2).replace(/"([^"]+)":/g, "$1:"), ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super(), this.issues = [], this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    }, this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    let actualProto = new.target.prototype;
    Object.setPrototypeOf ? Object.setPrototypeOf(this, actualProto) : this.__proto__ = actualProto, this.name = "ZodError", this.issues = issues;
  }
  format(_mapper) {
    let mapper = _mapper || function(issue) {
      return issue.message;
    }, fieldErrors = { _errors: [] }, processError = (error) => {
      for (let issue of error.issues)
        if (issue.code === "invalid_union")
          issue.unionErrors.map(processError);
        else if (issue.code === "invalid_return_type")
          processError(issue.returnTypeError);
        else if (issue.code === "invalid_arguments")
          processError(issue.argumentsError);
        else if (issue.path.length === 0)
          fieldErrors._errors.push(mapper(issue));
        else {
          let curr = fieldErrors, i = 0;
          for (; i < issue.path.length; ) {
            let el = issue.path[i];
            i === issue.path.length - 1 ? (curr[el] = curr[el] || { _errors: [] }, curr[el]._errors.push(mapper(issue))) : curr[el] = curr[el] || { _errors: [] }, curr = curr[el], i++;
          }
        }
    };
    return processError(this), fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError))
      throw new Error(`Not a ZodError: ${value}`);
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    let fieldErrors = {}, formErrors = [];
    for (let sub of this.issues)
      if (sub.path.length > 0) {
        let firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [], fieldErrors[firstEl].push(mapper(sub));
      } else
        formErrors.push(mapper(sub));
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => new ZodError(issues);

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      issue.received === ZodParsedType.undefined ? message = "Required" : message = `Expected ${issue.expected}, received ${issue.received}`;
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = "Invalid input";
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = "Invalid function arguments";
      break;
    case ZodIssueCode.invalid_return_type:
      message = "Invalid function return type";
      break;
    case ZodIssueCode.invalid_date:
      message = "Invalid date";
      break;
    case ZodIssueCode.invalid_string:
      typeof issue.validation == "object" ? "includes" in issue.validation ? (message = `Invalid input: must include "${issue.validation.includes}"`, typeof issue.validation.position == "number" && (message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`)) : "startsWith" in issue.validation ? message = `Invalid input: must start with "${issue.validation.startsWith}"` : "endsWith" in issue.validation ? message = `Invalid input: must end with "${issue.validation.endsWith}"` : util.assertNever(issue.validation) : issue.validation !== "regex" ? message = `Invalid ${issue.validation}` : message = "Invalid";
      break;
    case ZodIssueCode.too_small:
      issue.type === "array" ? message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? "at least" : "more than"} ${issue.minimum} element(s)` : issue.type === "string" ? message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? "at least" : "over"} ${issue.minimum} character(s)` : issue.type === "number" ? message = `Number must be ${issue.exact ? "exactly equal to " : issue.inclusive ? "greater than or equal to " : "greater than "}${issue.minimum}` : issue.type === "bigint" ? message = `Number must be ${issue.exact ? "exactly equal to " : issue.inclusive ? "greater than or equal to " : "greater than "}${issue.minimum}` : issue.type === "date" ? message = `Date must be ${issue.exact ? "exactly equal to " : issue.inclusive ? "greater than or equal to " : "greater than "}${new Date(Number(issue.minimum))}` : message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      issue.type === "array" ? message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? "at most" : "less than"} ${issue.maximum} element(s)` : issue.type === "string" ? message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? "at most" : "under"} ${issue.maximum} character(s)` : issue.type === "number" ? message = `Number must be ${issue.exact ? "exactly" : issue.inclusive ? "less than or equal to" : "less than"} ${issue.maximum}` : issue.type === "bigint" ? message = `BigInt must be ${issue.exact ? "exactly" : issue.inclusive ? "less than or equal to" : "less than"} ${issue.maximum}` : issue.type === "date" ? message = `Date must be ${issue.exact ? "exactly" : issue.inclusive ? "smaller than or equal to" : "smaller than"} ${new Date(Number(issue.maximum))}` : message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = "Invalid input";
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = "Intersection results could not be merged";
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError, util.assertNever(issue);
  }
  return { message };
}, en_default = errorMap;

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map2) {
  overrideErrorMap = map2;
}
function getErrorMap() {
  return overrideErrorMap;
}

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  let { data, path: path2, errorMaps, issueData } = params, fullPath = [...path2, ...issueData.path || []], fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0)
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  let errorMessage = "", maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (let map2 of maps)
    errorMessage = map2(fullIssue, { data, defaultError: errorMessage }).message;
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
}, EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  let overrideMap = getErrorMap(), issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    this.value === "valid" && (this.value = "dirty");
  }
  abort() {
    this.value !== "aborted" && (this.value = "aborted");
  }
  static mergeArray(status, results) {
    let arrayValue = [];
    for (let s of results) {
      if (s.status === "aborted")
        return INVALID;
      s.status === "dirty" && status.dirty(), arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs2) {
    let syncPairs = [];
    for (let pair of pairs2) {
      let key = await pair.key, value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs2) {
    let finalObject = {};
    for (let pair of pairs2) {
      let { key, value } = pair;
      if (key.status === "aborted" || value.status === "aborted")
        return INVALID;
      key.status === "dirty" && status.dirty(), value.status === "dirty" && status.dirty(), key.value !== "__proto__" && (typeof value.value < "u" || pair.alwaysSet) && (finalObject[key.value] = value.value);
    }
    return { status: status.value, value: finalObject };
  }
}, INVALID = Object.freeze({
  status: "aborted"
}), DIRTY = (value) => ({ status: "dirty", value }), OK = (value) => ({ status: "valid", value }), isAborted = (x) => x.status === "aborted", isDirty = (x) => x.status === "dirty", isValid = (x) => x.status === "valid", isAsync = (x) => typeof Promise < "u" && x instanceof Promise;

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message == "string" ? { message } : message || {}, errorUtil2.toString = (message) => typeof message == "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path2, key) {
    this._cachedPath = [], this.parent = parent, this.data = value, this._path = path2, this._key = key;
  }
  get path() {
    return this._cachedPath.length || (Array.isArray(this._key) ? this._cachedPath.push(...this._path, ...this._key) : this._cachedPath.push(...this._path, this._key)), this._cachedPath;
  }
}, handleResult = (ctx, result) => {
  if (isValid(result))
    return { success: !0, data: result.value };
  if (!ctx.common.issues.length)
    throw new Error("Validation failed but no issues detected.");
  return {
    success: !1,
    get error() {
      if (this._error)
        return this._error;
      let error = new ZodError(ctx.common.issues);
      return this._error = error, this._error;
    }
  };
};
function processCreateParams(params) {
  if (!params)
    return {};
  let { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error))
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  return errorMap2 ? { errorMap: errorMap2, description } : { errorMap: (iss, ctx) => {
    let { message } = params;
    return iss.code === "invalid_enum_value" ? { message: message ?? ctx.defaultError } : typeof ctx.data > "u" ? { message: message ?? required_error ?? ctx.defaultError } : iss.code !== "invalid_type" ? { message: ctx.defaultError } : { message: message ?? invalid_type_error ?? ctx.defaultError };
  }, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    let result = this._parse(input);
    if (isAsync(result))
      throw new Error("Synchronous parse encountered promise.");
    return result;
  }
  _parseAsync(input) {
    let result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    let result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    let ctx = {
      common: {
        issues: [],
        async: params?.async ?? !1,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    }, result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    let ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async)
      try {
        let result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        err?.message?.toLowerCase()?.includes("encountered") && (this["~standard"].async = !0), ctx.common = {
          issues: [],
          async: !0
        };
      }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    let result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    let ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: !0
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    }, maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx }), result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    let getIssueProperties = (val) => typeof message == "string" || typeof message > "u" ? { message } : typeof message == "function" ? message(val) : message;
    return this._refinement((val, ctx) => {
      let result = check(val), setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      return typeof Promise < "u" && result instanceof Promise ? result.then((data) => data ? !0 : (setError(), !1)) : result ? !0 : (setError(), !1);
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => check(val) ? !0 : (ctx.addIssue(typeof refinementData == "function" ? refinementData(val, ctx) : refinementData), !1));
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync, this._def = def, this.parse = this.parse.bind(this), this.safeParse = this.safeParse.bind(this), this.parseAsync = this.parseAsync.bind(this), this.safeParseAsync = this.safeParseAsync.bind(this), this.spa = this.spa.bind(this), this.refine = this.refine.bind(this), this.refinement = this.refinement.bind(this), this.superRefine = this.superRefine.bind(this), this.optional = this.optional.bind(this), this.nullable = this.nullable.bind(this), this.nullish = this.nullish.bind(this), this.array = this.array.bind(this), this.promise = this.promise.bind(this), this.or = this.or.bind(this), this.and = this.and.bind(this), this.transform = this.transform.bind(this), this.brand = this.brand.bind(this), this.default = this.default.bind(this), this.catch = this.catch.bind(this), this.describe = this.describe.bind(this), this.pipe = this.pipe.bind(this), this.readonly = this.readonly.bind(this), this.isNullable = this.isNullable.bind(this), this.isOptional = this.isOptional.bind(this), this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    let defaultValueFunc = typeof def == "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    let catchValueFunc = typeof def == "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    let This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
}, cuidRegex = /^c[^\s-]{8,}$/i, cuid2Regex = /^[0-9a-z]+$/, ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i, uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i, nanoidRegex = /^[a-z0-9_-]{21}$/i, jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/, durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/, emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i, _emojiRegex = "^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$", emojiRegex, ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/, ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/, ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/, ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/, base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/, base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/, dateRegexSource = "((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))", dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = "[0-5]\\d";
  args.precision ? secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}` : args.precision == null && (secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`);
  let secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`, opts = [];
  return opts.push(args.local ? "Z?" : "Z"), args.offset && opts.push("([+-]\\d{2}:?\\d{2})"), regex = `${regex}(${opts.join("|")})`, new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  return !!((version === "v4" || !version) && ipv4Regex.test(ip) || (version === "v6" || !version) && ipv6Regex.test(ip));
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return !1;
  try {
    let [header] = jwt.split(".");
    if (!header)
      return !1;
    let base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "="), decoded = JSON.parse(atob(base64));
    return !(typeof decoded != "object" || decoded === null || "typ" in decoded && decoded?.typ !== "JWT" || !decoded.alg || alg && decoded.alg !== alg);
  } catch {
    return !1;
  }
}
function isValidCidr(ip, version) {
  return !!((version === "v4" || !version) && ipv4CidrRegex.test(ip) || (version === "v6" || !version) && ipv6CidrRegex.test(ip));
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce && (input.data = String(input.data)), this._getType(input) !== ZodParsedType.string) {
      let ctx2 = this._getOrReturnCtx(input);
      return addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      }), INVALID;
    }
    let status = new ParseStatus(), ctx;
    for (let check of this._def.checks)
      if (check.kind === "min")
        input.data.length < check.value && (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: check.value,
          type: "string",
          inclusive: !0,
          exact: !1,
          message: check.message
        }), status.dirty());
      else if (check.kind === "max")
        input.data.length > check.value && (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: check.value,
          type: "string",
          inclusive: !0,
          exact: !1,
          message: check.message
        }), status.dirty());
      else if (check.kind === "length") {
        let tooBig = input.data.length > check.value, tooSmall = input.data.length < check.value;
        (tooBig || tooSmall) && (ctx = this._getOrReturnCtx(input, ctx), tooBig ? addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: check.value,
          type: "string",
          inclusive: !0,
          exact: !0,
          message: check.message
        }) : tooSmall && addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: check.value,
          type: "string",
          inclusive: !0,
          exact: !0,
          message: check.message
        }), status.dirty());
      } else if (check.kind === "email")
        emailRegex.test(input.data) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
          validation: "email",
          code: ZodIssueCode.invalid_string,
          message: check.message
        }), status.dirty());
      else if (check.kind === "emoji")
        emojiRegex || (emojiRegex = new RegExp(_emojiRegex, "u")), emojiRegex.test(input.data) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
          validation: "emoji",
          code: ZodIssueCode.invalid_string,
          message: check.message
        }), status.dirty());
      else if (check.kind === "uuid")
        uuidRegex.test(input.data) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
          validation: "uuid",
          code: ZodIssueCode.invalid_string,
          message: check.message
        }), status.dirty());
      else if (check.kind === "nanoid")
        nanoidRegex.test(input.data) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
          validation: "nanoid",
          code: ZodIssueCode.invalid_string,
          message: check.message
        }), status.dirty());
      else if (check.kind === "cuid")
        cuidRegex.test(input.data) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
          validation: "cuid",
          code: ZodIssueCode.invalid_string,
          message: check.message
        }), status.dirty());
      else if (check.kind === "cuid2")
        cuid2Regex.test(input.data) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
          validation: "cuid2",
          code: ZodIssueCode.invalid_string,
          message: check.message
        }), status.dirty());
      else if (check.kind === "ulid")
        ulidRegex.test(input.data) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
          validation: "ulid",
          code: ZodIssueCode.invalid_string,
          message: check.message
        }), status.dirty());
      else if (check.kind === "url")
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          }), status.dirty();
        }
      else check.kind === "regex" ? (check.regex.lastIndex = 0, check.regex.test(input.data) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        validation: "regex",
        code: ZodIssueCode.invalid_string,
        message: check.message
      }), status.dirty())) : check.kind === "trim" ? input.data = input.data.trim() : check.kind === "includes" ? input.data.includes(check.value, check.position) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_string,
        validation: { includes: check.value, position: check.position },
        message: check.message
      }), status.dirty()) : check.kind === "toLowerCase" ? input.data = input.data.toLowerCase() : check.kind === "toUpperCase" ? input.data = input.data.toUpperCase() : check.kind === "startsWith" ? input.data.startsWith(check.value) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_string,
        validation: { startsWith: check.value },
        message: check.message
      }), status.dirty()) : check.kind === "endsWith" ? input.data.endsWith(check.value) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_string,
        validation: { endsWith: check.value },
        message: check.message
      }), status.dirty()) : check.kind === "datetime" ? datetimeRegex(check).test(input.data) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_string,
        validation: "datetime",
        message: check.message
      }), status.dirty()) : check.kind === "date" ? dateRegex.test(input.data) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_string,
        validation: "date",
        message: check.message
      }), status.dirty()) : check.kind === "time" ? timeRegex(check).test(input.data) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_string,
        validation: "time",
        message: check.message
      }), status.dirty()) : check.kind === "duration" ? durationRegex.test(input.data) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        validation: "duration",
        code: ZodIssueCode.invalid_string,
        message: check.message
      }), status.dirty()) : check.kind === "ip" ? isValidIP(input.data, check.version) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        validation: "ip",
        code: ZodIssueCode.invalid_string,
        message: check.message
      }), status.dirty()) : check.kind === "jwt" ? isValidJWT(input.data, check.alg) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        validation: "jwt",
        code: ZodIssueCode.invalid_string,
        message: check.message
      }), status.dirty()) : check.kind === "cidr" ? isValidCidr(input.data, check.version) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        validation: "cidr",
        code: ZodIssueCode.invalid_string,
        message: check.message
      }), status.dirty()) : check.kind === "base64" ? base64Regex.test(input.data) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        validation: "base64",
        code: ZodIssueCode.invalid_string,
        message: check.message
      }), status.dirty()) : check.kind === "base64url" ? base64urlRegex.test(input.data) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        validation: "base64url",
        code: ZodIssueCode.invalid_string,
        message: check.message
      }), status.dirty()) : util.assertNever(check);
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    return typeof options == "string" ? this._addCheck({
      kind: "datetime",
      precision: null,
      offset: !1,
      local: !1,
      message: options
    }) : this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision > "u" ? null : options?.precision,
      offset: options?.offset ?? !1,
      local: options?.local ?? !1,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    return typeof options == "string" ? this._addCheck({
      kind: "time",
      precision: null,
      message: options
    }) : this._addCheck({
      kind: "time",
      precision: typeof options?.precision > "u" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (let ch of this._def.checks)
      ch.kind === "min" && (min === null || ch.value > min) && (min = ch.value);
    return min;
  }
  get maxLength() {
    let max = null;
    for (let ch of this._def.checks)
      ch.kind === "max" && (max === null || ch.value < max) && (max = ch.value);
    return max;
  }
};
ZodString.create = (params) => new ZodString({
  checks: [],
  typeName: ZodFirstPartyTypeKind.ZodString,
  coerce: params?.coerce ?? !1,
  ...processCreateParams(params)
});
function floatSafeRemainder(val, step) {
  let valDecCount = (val.toString().split(".")[1] || "").length, stepDecCount = (step.toString().split(".")[1] || "").length, decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount, valInt = Number.parseInt(val.toFixed(decCount).replace(".", "")), stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments), this.min = this.gte, this.max = this.lte, this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce && (input.data = Number(input.data)), this._getType(input) !== ZodParsedType.number) {
      let ctx2 = this._getOrReturnCtx(input);
      return addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      }), INVALID;
    }
    let ctx, status = new ParseStatus();
    for (let check of this._def.checks)
      check.kind === "int" ? util.isInteger(input.data) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: "integer",
        received: "float",
        message: check.message
      }), status.dirty()) : check.kind === "min" ? (check.inclusive ? input.data < check.value : input.data <= check.value) && (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: check.value,
        type: "number",
        inclusive: check.inclusive,
        exact: !1,
        message: check.message
      }), status.dirty()) : check.kind === "max" ? (check.inclusive ? input.data > check.value : input.data >= check.value) && (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: check.value,
        type: "number",
        inclusive: check.inclusive,
        exact: !1,
        message: check.message
      }), status.dirty()) : check.kind === "multipleOf" ? floatSafeRemainder(input.data, check.value) !== 0 && (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        code: ZodIssueCode.not_multiple_of,
        multipleOf: check.value,
        message: check.message
      }), status.dirty()) : check.kind === "finite" ? Number.isFinite(input.data) || (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        code: ZodIssueCode.not_finite,
        message: check.message
      }), status.dirty()) : util.assertNever(check);
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, !0, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, !1, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, !0, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, !1, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: !1,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: !1,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: !0,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: !0,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: !0,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: !0,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (let ch of this._def.checks)
      ch.kind === "min" && (min === null || ch.value > min) && (min = ch.value);
    return min;
  }
  get maxValue() {
    let max = null;
    for (let ch of this._def.checks)
      ch.kind === "max" && (max === null || ch.value < max) && (max = ch.value);
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null, min = null;
    for (let ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf")
        return !0;
      ch.kind === "min" ? (min === null || ch.value > min) && (min = ch.value) : ch.kind === "max" && (max === null || ch.value < max) && (max = ch.value);
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => new ZodNumber({
  checks: [],
  typeName: ZodFirstPartyTypeKind.ZodNumber,
  coerce: params?.coerce || !1,
  ...processCreateParams(params)
});
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments), this.min = this.gte, this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce)
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    if (this._getType(input) !== ZodParsedType.bigint)
      return this._getInvalidInput(input);
    let ctx, status = new ParseStatus();
    for (let check of this._def.checks)
      check.kind === "min" ? (check.inclusive ? input.data < check.value : input.data <= check.value) && (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        type: "bigint",
        minimum: check.value,
        inclusive: check.inclusive,
        message: check.message
      }), status.dirty()) : check.kind === "max" ? (check.inclusive ? input.data > check.value : input.data >= check.value) && (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        type: "bigint",
        maximum: check.value,
        inclusive: check.inclusive,
        message: check.message
      }), status.dirty()) : check.kind === "multipleOf" ? input.data % check.value !== BigInt(0) && (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        code: ZodIssueCode.not_multiple_of,
        multipleOf: check.value,
        message: check.message
      }), status.dirty()) : util.assertNever(check);
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    let ctx = this._getOrReturnCtx(input);
    return addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    }), INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, !0, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, !1, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, !0, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, !1, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: !1,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: !1,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: !0,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: !0,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (let ch of this._def.checks)
      ch.kind === "min" && (min === null || ch.value > min) && (min = ch.value);
    return min;
  }
  get maxValue() {
    let max = null;
    for (let ch of this._def.checks)
      ch.kind === "max" && (max === null || ch.value < max) && (max = ch.value);
    return max;
  }
};
ZodBigInt.create = (params) => new ZodBigInt({
  checks: [],
  typeName: ZodFirstPartyTypeKind.ZodBigInt,
  coerce: params?.coerce ?? !1,
  ...processCreateParams(params)
});
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce && (input.data = !!input.data), this._getType(input) !== ZodParsedType.boolean) {
      let ctx = this._getOrReturnCtx(input);
      return addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      }), INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => new ZodBoolean({
  typeName: ZodFirstPartyTypeKind.ZodBoolean,
  coerce: params?.coerce || !1,
  ...processCreateParams(params)
});
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce && (input.data = new Date(input.data)), this._getType(input) !== ZodParsedType.date) {
      let ctx2 = this._getOrReturnCtx(input);
      return addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      }), INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      let ctx2 = this._getOrReturnCtx(input);
      return addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      }), INVALID;
    }
    let status = new ParseStatus(), ctx;
    for (let check of this._def.checks)
      check.kind === "min" ? input.data.getTime() < check.value && (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        message: check.message,
        inclusive: !0,
        exact: !1,
        minimum: check.value,
        type: "date"
      }), status.dirty()) : check.kind === "max" ? input.data.getTime() > check.value && (ctx = this._getOrReturnCtx(input, ctx), addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        message: check.message,
        inclusive: !0,
        exact: !1,
        maximum: check.value,
        type: "date"
      }), status.dirty()) : util.assertNever(check);
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (let ch of this._def.checks)
      ch.kind === "min" && (min === null || ch.value > min) && (min = ch.value);
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (let ch of this._def.checks)
      ch.kind === "max" && (max === null || ch.value < max) && (max = ch.value);
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => new ZodDate({
  checks: [],
  coerce: params?.coerce || !1,
  typeName: ZodFirstPartyTypeKind.ZodDate,
  ...processCreateParams(params)
});
var ZodSymbol = class extends ZodType {
  _parse(input) {
    if (this._getType(input) !== ZodParsedType.symbol) {
      let ctx = this._getOrReturnCtx(input);
      return addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      }), INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => new ZodSymbol({
  typeName: ZodFirstPartyTypeKind.ZodSymbol,
  ...processCreateParams(params)
});
var ZodUndefined = class extends ZodType {
  _parse(input) {
    if (this._getType(input) !== ZodParsedType.undefined) {
      let ctx = this._getOrReturnCtx(input);
      return addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      }), INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => new ZodUndefined({
  typeName: ZodFirstPartyTypeKind.ZodUndefined,
  ...processCreateParams(params)
});
var ZodNull = class extends ZodType {
  _parse(input) {
    if (this._getType(input) !== ZodParsedType.null) {
      let ctx = this._getOrReturnCtx(input);
      return addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      }), INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => new ZodNull({
  typeName: ZodFirstPartyTypeKind.ZodNull,
  ...processCreateParams(params)
});
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments), this._any = !0;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => new ZodAny({
  typeName: ZodFirstPartyTypeKind.ZodAny,
  ...processCreateParams(params)
});
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments), this._unknown = !0;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => new ZodUnknown({
  typeName: ZodFirstPartyTypeKind.ZodUnknown,
  ...processCreateParams(params)
});
var ZodNever = class extends ZodType {
  _parse(input) {
    let ctx = this._getOrReturnCtx(input);
    return addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    }), INVALID;
  }
};
ZodNever.create = (params) => new ZodNever({
  typeName: ZodFirstPartyTypeKind.ZodNever,
  ...processCreateParams(params)
});
var ZodVoid = class extends ZodType {
  _parse(input) {
    if (this._getType(input) !== ZodParsedType.undefined) {
      let ctx = this._getOrReturnCtx(input);
      return addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      }), INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => new ZodVoid({
  typeName: ZodFirstPartyTypeKind.ZodVoid,
  ...processCreateParams(params)
});
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    let { ctx, status } = this._processInputParams(input), def = this._def;
    if (ctx.parsedType !== ZodParsedType.array)
      return addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      }), INVALID;
    if (def.exactLength !== null) {
      let tooBig = ctx.data.length > def.exactLength.value, tooSmall = ctx.data.length < def.exactLength.value;
      (tooBig || tooSmall) && (addIssueToContext(ctx, {
        code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
        minimum: tooSmall ? def.exactLength.value : void 0,
        maximum: tooBig ? def.exactLength.value : void 0,
        type: "array",
        inclusive: !0,
        exact: !0,
        message: def.exactLength.message
      }), status.dirty());
    }
    if (def.minLength !== null && ctx.data.length < def.minLength.value && (addIssueToContext(ctx, {
      code: ZodIssueCode.too_small,
      minimum: def.minLength.value,
      type: "array",
      inclusive: !0,
      exact: !1,
      message: def.minLength.message
    }), status.dirty()), def.maxLength !== null && ctx.data.length > def.maxLength.value && (addIssueToContext(ctx, {
      code: ZodIssueCode.too_big,
      maximum: def.maxLength.value,
      type: "array",
      inclusive: !0,
      exact: !1,
      message: def.maxLength.message
    }), status.dirty()), ctx.common.async)
      return Promise.all([...ctx.data].map((item, i) => def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i)))).then((result2) => ParseStatus.mergeArray(status, result2));
    let result = [...ctx.data].map((item, i) => def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema2, params) => new ZodArray({
  type: schema2,
  minLength: null,
  maxLength: null,
  exactLength: null,
  typeName: ZodFirstPartyTypeKind.ZodArray,
  ...processCreateParams(params)
});
function deepPartialify(schema2) {
  if (schema2 instanceof ZodObject) {
    let newShape = {};
    for (let key in schema2.shape) {
      let fieldSchema = schema2.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema2._def,
      shape: () => newShape
    });
  } else return schema2 instanceof ZodArray ? new ZodArray({
    ...schema2._def,
    type: deepPartialify(schema2.element)
  }) : schema2 instanceof ZodOptional ? ZodOptional.create(deepPartialify(schema2.unwrap())) : schema2 instanceof ZodNullable ? ZodNullable.create(deepPartialify(schema2.unwrap())) : schema2 instanceof ZodTuple ? ZodTuple.create(schema2.items.map((item) => deepPartialify(item))) : schema2;
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments), this._cached = null, this.nonstrict = this.passthrough, this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    let shape = this._def.shape(), keys = util.objectKeys(shape);
    return this._cached = { shape, keys }, this._cached;
  }
  _parse(input) {
    if (this._getType(input) !== ZodParsedType.object) {
      let ctx2 = this._getOrReturnCtx(input);
      return addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      }), INVALID;
    }
    let { status, ctx } = this._processInputParams(input), { shape, keys: shapeKeys } = this._getCached(), extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip"))
      for (let key in ctx.data)
        shapeKeys.includes(key) || extraKeys.push(key);
    let pairs2 = [];
    for (let key of shapeKeys) {
      let keyValidator = shape[key], value = ctx.data[key];
      pairs2.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      let unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough")
        for (let key of extraKeys)
          pairs2.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
      else if (unknownKeys === "strict")
        extraKeys.length > 0 && (addIssueToContext(ctx, {
          code: ZodIssueCode.unrecognized_keys,
          keys: extraKeys
        }), status.dirty());
      else if (unknownKeys !== "strip")
        throw new Error("Internal ZodObject error: invalid unknownKeys value.");
    } else {
      let catchall = this._def.catchall;
      for (let key of extraKeys) {
        let value = ctx.data[key];
        pairs2.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    return ctx.common.async ? Promise.resolve().then(async () => {
      let syncPairs = [];
      for (let pair of pairs2) {
        let key = await pair.key, value = await pair.value;
        syncPairs.push({
          key,
          value,
          alwaysSet: pair.alwaysSet
        });
      }
      return syncPairs;
    }).then((syncPairs) => ParseStatus.mergeObjectSync(status, syncPairs)) : ParseStatus.mergeObjectSync(status, pairs2);
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    return errorUtil.errToObj, new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          let defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          return issue.code === "unrecognized_keys" ? {
            message: errorUtil.errToObj(message).message ?? defaultError
          } : {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    return new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema2) {
    return this.augment({ [key]: schema2 });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    let shape = {};
    for (let key of util.objectKeys(mask))
      mask[key] && this.shape[key] && (shape[key] = this.shape[key]);
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    let shape = {};
    for (let key of util.objectKeys(this.shape))
      mask[key] || (shape[key] = this.shape[key]);
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    let newShape = {};
    for (let key of util.objectKeys(this.shape)) {
      let fieldSchema = this.shape[key];
      mask && !mask[key] ? newShape[key] = fieldSchema : newShape[key] = fieldSchema.optional();
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    let newShape = {};
    for (let key of util.objectKeys(this.shape))
      if (mask && !mask[key])
        newShape[key] = this.shape[key];
      else {
        let newField = this.shape[key];
        for (; newField instanceof ZodOptional; )
          newField = newField._def.innerType;
        newShape[key] = newField;
      }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => new ZodObject({
  shape: () => shape,
  unknownKeys: "strip",
  catchall: ZodNever.create(),
  typeName: ZodFirstPartyTypeKind.ZodObject,
  ...processCreateParams(params)
});
ZodObject.strictCreate = (shape, params) => new ZodObject({
  shape: () => shape,
  unknownKeys: "strict",
  catchall: ZodNever.create(),
  typeName: ZodFirstPartyTypeKind.ZodObject,
  ...processCreateParams(params)
});
ZodObject.lazycreate = (shape, params) => new ZodObject({
  shape,
  unknownKeys: "strip",
  catchall: ZodNever.create(),
  typeName: ZodFirstPartyTypeKind.ZodObject,
  ...processCreateParams(params)
});
var ZodUnion = class extends ZodType {
  _parse(input) {
    let { ctx } = this._processInputParams(input), options = this._def.options;
    function handleResults(results) {
      for (let result of results)
        if (result.result.status === "valid")
          return result.result;
      for (let result of results)
        if (result.result.status === "dirty")
          return ctx.common.issues.push(...result.ctx.common.issues), result.result;
      let unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      return addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      }), INVALID;
    }
    if (ctx.common.async)
      return Promise.all(options.map(async (option) => {
        let childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    {
      let dirty, issues = [];
      for (let option of options) {
        let childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        }, result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid")
          return result;
        result.status === "dirty" && !dirty && (dirty = { result, ctx: childCtx }), childCtx.common.issues.length && issues.push(childCtx.common.issues);
      }
      if (dirty)
        return ctx.common.issues.push(...dirty.ctx.common.issues), dirty.result;
      let unionErrors = issues.map((issues2) => new ZodError(issues2));
      return addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      }), INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types2, params) => new ZodUnion({
  options: types2,
  typeName: ZodFirstPartyTypeKind.ZodUnion,
  ...processCreateParams(params)
});
var getDiscriminator = (type2) => type2 instanceof ZodLazy ? getDiscriminator(type2.schema) : type2 instanceof ZodEffects ? getDiscriminator(type2.innerType()) : type2 instanceof ZodLiteral ? [type2.value] : type2 instanceof ZodEnum ? type2.options : type2 instanceof ZodNativeEnum ? util.objectValues(type2.enum) : type2 instanceof ZodDefault ? getDiscriminator(type2._def.innerType) : type2 instanceof ZodUndefined ? [void 0] : type2 instanceof ZodNull ? [null] : type2 instanceof ZodOptional ? [void 0, ...getDiscriminator(type2.unwrap())] : type2 instanceof ZodNullable ? [null, ...getDiscriminator(type2.unwrap())] : type2 instanceof ZodBranded || type2 instanceof ZodReadonly ? getDiscriminator(type2.unwrap()) : type2 instanceof ZodCatch ? getDiscriminator(type2._def.innerType) : [], ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    let { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object)
      return addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      }), INVALID;
    let discriminator = this.discriminator, discriminatorValue = ctx.data[discriminator], option = this.optionsMap.get(discriminatorValue);
    return option ? ctx.common.async ? option._parseAsync({
      data: ctx.data,
      path: ctx.path,
      parent: ctx
    }) : option._parseSync({
      data: ctx.data,
      path: ctx.path,
      parent: ctx
    }) : (addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_union_discriminator,
      options: Array.from(this.optionsMap.keys()),
      path: [discriminator]
    }), INVALID);
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    let optionsMap = /* @__PURE__ */ new Map();
    for (let type2 of options) {
      let discriminatorValues = getDiscriminator(type2.shape[discriminator]);
      if (!discriminatorValues.length)
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      for (let value of discriminatorValues) {
        if (optionsMap.has(value))
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        optionsMap.set(value, type2);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  let aType = getParsedType(a), bType = getParsedType(b);
  if (a === b)
    return { valid: !0, data: a };
  if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    let bKeys = util.objectKeys(b), sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1), newObj = { ...a, ...b };
    for (let key of sharedKeys) {
      let sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid)
        return { valid: !1 };
      newObj[key] = sharedValue.data;
    }
    return { valid: !0, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length)
      return { valid: !1 };
    let newArray = [];
    for (let index = 0; index < a.length; index++) {
      let itemA = a[index], itemB = b[index], sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid)
        return { valid: !1 };
      newArray.push(sharedValue.data);
    }
    return { valid: !0, data: newArray };
  } else return aType === ZodParsedType.date && bType === ZodParsedType.date && +a == +b ? { valid: !0, data: a } : { valid: !1 };
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    let { status, ctx } = this._processInputParams(input), handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight))
        return INVALID;
      let merged = mergeValues(parsedLeft.value, parsedRight.value);
      return merged.valid ? ((isDirty(parsedLeft) || isDirty(parsedRight)) && status.dirty(), { status: status.value, value: merged.data }) : (addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_intersection_types
      }), INVALID);
    };
    return ctx.common.async ? Promise.all([
      this._def.left._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }),
      this._def.right._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      })
    ]).then(([left, right]) => handleParsed(left, right)) : handleParsed(this._def.left._parseSync({
      data: ctx.data,
      path: ctx.path,
      parent: ctx
    }), this._def.right._parseSync({
      data: ctx.data,
      path: ctx.path,
      parent: ctx
    }));
  }
};
ZodIntersection.create = (left, right, params) => new ZodIntersection({
  left,
  right,
  typeName: ZodFirstPartyTypeKind.ZodIntersection,
  ...processCreateParams(params)
});
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    let { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array)
      return addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      }), INVALID;
    if (ctx.data.length < this._def.items.length)
      return addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: !0,
        exact: !1,
        type: "array"
      }), INVALID;
    !this._def.rest && ctx.data.length > this._def.items.length && (addIssueToContext(ctx, {
      code: ZodIssueCode.too_big,
      maximum: this._def.items.length,
      inclusive: !0,
      exact: !1,
      type: "array"
    }), status.dirty());
    let items = [...ctx.data].map((item, itemIndex) => {
      let schema2 = this._def.items[itemIndex] || this._def.rest;
      return schema2 ? schema2._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex)) : null;
    }).filter((x) => !!x);
    return ctx.common.async ? Promise.all(items).then((results) => ParseStatus.mergeArray(status, results)) : ParseStatus.mergeArray(status, items);
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas))
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    let { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object)
      return addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      }), INVALID;
    let pairs2 = [], keyType = this._def.keyType, valueType = this._def.valueType;
    for (let key in ctx.data)
      pairs2.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    return ctx.common.async ? ParseStatus.mergeObjectAsync(status, pairs2) : ParseStatus.mergeObjectSync(status, pairs2);
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    return second instanceof ZodType ? new _ZodRecord({
      keyType: first,
      valueType: second,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(third)
    }) : new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
}, ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    let { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map)
      return addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      }), INVALID;
    let keyType = this._def.keyType, valueType = this._def.valueType, pairs2 = [...ctx.data.entries()].map(([key, value], index) => ({
      key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
      value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
    }));
    if (ctx.common.async) {
      let finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (let pair of pairs2) {
          let key = await pair.key, value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted")
            return INVALID;
          (key.status === "dirty" || value.status === "dirty") && status.dirty(), finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      let finalMap = /* @__PURE__ */ new Map();
      for (let pair of pairs2) {
        let key = pair.key, value = pair.value;
        if (key.status === "aborted" || value.status === "aborted")
          return INVALID;
        (key.status === "dirty" || value.status === "dirty") && status.dirty(), finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => new ZodMap({
  valueType,
  keyType,
  typeName: ZodFirstPartyTypeKind.ZodMap,
  ...processCreateParams(params)
});
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    let { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set)
      return addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      }), INVALID;
    let def = this._def;
    def.minSize !== null && ctx.data.size < def.minSize.value && (addIssueToContext(ctx, {
      code: ZodIssueCode.too_small,
      minimum: def.minSize.value,
      type: "set",
      inclusive: !0,
      exact: !1,
      message: def.minSize.message
    }), status.dirty()), def.maxSize !== null && ctx.data.size > def.maxSize.value && (addIssueToContext(ctx, {
      code: ZodIssueCode.too_big,
      maximum: def.maxSize.value,
      type: "set",
      inclusive: !0,
      exact: !1,
      message: def.maxSize.message
    }), status.dirty());
    let valueType = this._def.valueType;
    function finalizeSet(elements2) {
      let parsedSet = /* @__PURE__ */ new Set();
      for (let element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        element.status === "dirty" && status.dirty(), parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    let elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    return ctx.common.async ? Promise.all(elements).then((elements2) => finalizeSet(elements2)) : finalizeSet(elements);
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => new ZodSet({
  valueType,
  minSize: null,
  maxSize: null,
  typeName: ZodFirstPartyTypeKind.ZodSet,
  ...processCreateParams(params)
});
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments), this.validate = this.implement;
  }
  _parse(input) {
    let { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function)
      return addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      }), INVALID;
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    let params = { errorMap: ctx.common.contextualErrorMap }, fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      let me = this;
      return OK(async function(...args) {
        let error = new ZodError([]), parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          throw error.addIssue(makeArgsIssue(args, e)), error;
        }), result = await Reflect.apply(fn, this, parsedArgs);
        return await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          throw error.addIssue(makeReturnsIssue(result, e)), error;
        });
      });
    } else {
      let me = this;
      return OK(function(...args) {
        let parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success)
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        let result = Reflect.apply(fn, this, parsedArgs.data), parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success)
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    return this.parse(func);
  }
  strictImplement(func) {
    return this.parse(func);
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args || ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
}, ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    let { ctx } = this._processInputParams(input);
    return this._def.getter()._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => new ZodLazy({
  getter,
  typeName: ZodFirstPartyTypeKind.ZodLazy,
  ...processCreateParams(params)
});
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      let ctx = this._getOrReturnCtx(input);
      return addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      }), INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => new ZodLiteral({
  value,
  typeName: ZodFirstPartyTypeKind.ZodLiteral,
  ...processCreateParams(params)
});
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data != "string") {
      let ctx = this._getOrReturnCtx(input), expectedValues = this._def.values;
      return addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      }), INVALID;
    }
    if (this._cache || (this._cache = new Set(this._def.values)), !this._cache.has(input.data)) {
      let ctx = this._getOrReturnCtx(input), expectedValues = this._def.values;
      return addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      }), INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    let enumValues = {};
    for (let val of this._def.values)
      enumValues[val] = val;
    return enumValues;
  }
  get Values() {
    let enumValues = {};
    for (let val of this._def.values)
      enumValues[val] = val;
    return enumValues;
  }
  get Enum() {
    let enumValues = {};
    for (let val of this._def.values)
      enumValues[val] = val;
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    let nativeEnumValues = util.getValidEnumValues(this._def.values), ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      let expectedValues = util.objectValues(nativeEnumValues);
      return addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      }), INVALID;
    }
    if (this._cache || (this._cache = new Set(util.getValidEnumValues(this._def.values))), !this._cache.has(input.data)) {
      let expectedValues = util.objectValues(nativeEnumValues);
      return addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      }), INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => new ZodNativeEnum({
  values,
  typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
  ...processCreateParams(params)
});
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    let { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === !1)
      return addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      }), INVALID;
    let promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => this._def.type.parseAsync(data, {
      path: ctx.path,
      errorMap: ctx.common.contextualErrorMap
    })));
  }
};
ZodPromise.create = (schema2, params) => new ZodPromise({
  type: schema2,
  typeName: ZodFirstPartyTypeKind.ZodPromise,
  ...processCreateParams(params)
});
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    let { status, ctx } = this._processInputParams(input), effect = this._def.effect || null, checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg), arg.fatal ? status.abort() : status.dirty();
      },
      get path() {
        return ctx.path;
      }
    };
    if (checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx), effect.type === "preprocess") {
      let processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async)
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          let result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          return result.status === "aborted" ? INVALID : result.status === "dirty" ? DIRTY(result.value) : status.value === "dirty" ? DIRTY(result.value) : result;
        });
      {
        if (status.value === "aborted")
          return INVALID;
        let result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        return result.status === "aborted" ? INVALID : result.status === "dirty" ? DIRTY(result.value) : status.value === "dirty" ? DIRTY(result.value) : result;
      }
    }
    if (effect.type === "refinement") {
      let executeRefinement = (acc) => {
        let result = effect.refinement(acc, checkCtx);
        if (ctx.common.async)
          return Promise.resolve(result);
        if (result instanceof Promise)
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        return acc;
      };
      if (ctx.common.async === !1) {
        let inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        return inner.status === "aborted" ? INVALID : (inner.status === "dirty" && status.dirty(), executeRefinement(inner.value), { status: status.value, value: inner.value });
      } else
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => inner.status === "aborted" ? INVALID : (inner.status === "dirty" && status.dirty(), executeRefinement(inner.value).then(() => ({ status: status.value, value: inner.value }))));
    }
    if (effect.type === "transform")
      if (ctx.common.async === !1) {
        let base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        let result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise)
          throw new Error("Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.");
        return { status: status.value, value: result };
      } else
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => isValid(base) ? Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
          status: status.value,
          value: result
        })) : INVALID);
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema2, effect, params) => new ZodEffects({
  schema: schema2,
  typeName: ZodFirstPartyTypeKind.ZodEffects,
  effect,
  ...processCreateParams(params)
});
ZodEffects.createWithPreprocess = (preprocess, schema2, params) => new ZodEffects({
  schema: schema2,
  effect: { type: "preprocess", transform: preprocess },
  typeName: ZodFirstPartyTypeKind.ZodEffects,
  ...processCreateParams(params)
});
var ZodOptional = class extends ZodType {
  _parse(input) {
    return this._getType(input) === ZodParsedType.undefined ? OK(void 0) : this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type2, params) => new ZodOptional({
  innerType: type2,
  typeName: ZodFirstPartyTypeKind.ZodOptional,
  ...processCreateParams(params)
});
var ZodNullable = class extends ZodType {
  _parse(input) {
    return this._getType(input) === ZodParsedType.null ? OK(null) : this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type2, params) => new ZodNullable({
  innerType: type2,
  typeName: ZodFirstPartyTypeKind.ZodNullable,
  ...processCreateParams(params)
});
var ZodDefault = class extends ZodType {
  _parse(input) {
    let { ctx } = this._processInputParams(input), data = ctx.data;
    return ctx.parsedType === ZodParsedType.undefined && (data = this._def.defaultValue()), this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type2, params) => new ZodDefault({
  innerType: type2,
  typeName: ZodFirstPartyTypeKind.ZodDefault,
  defaultValue: typeof params.default == "function" ? params.default : () => params.default,
  ...processCreateParams(params)
});
var ZodCatch = class extends ZodType {
  _parse(input) {
    let { ctx } = this._processInputParams(input), newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    }, result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    return isAsync(result) ? result.then((result2) => ({
      status: "valid",
      value: result2.status === "valid" ? result2.value : this._def.catchValue({
        get error() {
          return new ZodError(newCtx.common.issues);
        },
        input: newCtx.data
      })
    })) : {
      status: "valid",
      value: result.status === "valid" ? result.value : this._def.catchValue({
        get error() {
          return new ZodError(newCtx.common.issues);
        },
        input: newCtx.data
      })
    };
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type2, params) => new ZodCatch({
  innerType: type2,
  typeName: ZodFirstPartyTypeKind.ZodCatch,
  catchValue: typeof params.catch == "function" ? params.catch : () => params.catch,
  ...processCreateParams(params)
});
var ZodNaN = class extends ZodType {
  _parse(input) {
    if (this._getType(input) !== ZodParsedType.nan) {
      let ctx = this._getOrReturnCtx(input);
      return addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      }), INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => new ZodNaN({
  typeName: ZodFirstPartyTypeKind.ZodNaN,
  ...processCreateParams(params)
});
var BRAND = Symbol("zod_brand"), ZodBranded = class extends ZodType {
  _parse(input) {
    let { ctx } = this._processInputParams(input), data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
}, ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    let { status, ctx } = this._processInputParams(input);
    if (ctx.common.async)
      return (async () => {
        let inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        return inResult.status === "aborted" ? INVALID : inResult.status === "dirty" ? (status.dirty(), DIRTY(inResult.value)) : this._def.out._parseAsync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      })();
    {
      let inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      return inResult.status === "aborted" ? INVALID : inResult.status === "dirty" ? (status.dirty(), {
        status: "dirty",
        value: inResult.value
      }) : this._def.out._parseSync({
        data: inResult.value,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
}, ZodReadonly = class extends ZodType {
  _parse(input) {
    let result = this._def.innerType._parse(input), freeze = (data) => (isValid(data) && (data.value = Object.freeze(data.value)), data);
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type2, params) => new ZodReadonly({
  innerType: type2,
  typeName: ZodFirstPartyTypeKind.ZodReadonly,
  ...processCreateParams(params)
});
function cleanParams(params, data) {
  let p = typeof params == "function" ? params(data) : typeof params == "string" ? { message: params } : params;
  return typeof p == "string" ? { message: p } : p;
}
function custom(check, _params = {}, fatal) {
  return check ? ZodAny.create().superRefine((data, ctx) => {
    let r = check(data);
    if (r instanceof Promise)
      return r.then((r2) => {
        if (!r2) {
          let params = cleanParams(_params, data), _fatal = params.fatal ?? fatal ?? !0;
          ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
        }
      });
    if (!r) {
      let params = cleanParams(_params, data), _fatal = params.fatal ?? fatal ?? !0;
      ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
    }
  }) : ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
}, ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2.ZodString = "ZodString", ZodFirstPartyTypeKind2.ZodNumber = "ZodNumber", ZodFirstPartyTypeKind2.ZodNaN = "ZodNaN", ZodFirstPartyTypeKind2.ZodBigInt = "ZodBigInt", ZodFirstPartyTypeKind2.ZodBoolean = "ZodBoolean", ZodFirstPartyTypeKind2.ZodDate = "ZodDate", ZodFirstPartyTypeKind2.ZodSymbol = "ZodSymbol", ZodFirstPartyTypeKind2.ZodUndefined = "ZodUndefined", ZodFirstPartyTypeKind2.ZodNull = "ZodNull", ZodFirstPartyTypeKind2.ZodAny = "ZodAny", ZodFirstPartyTypeKind2.ZodUnknown = "ZodUnknown", ZodFirstPartyTypeKind2.ZodNever = "ZodNever", ZodFirstPartyTypeKind2.ZodVoid = "ZodVoid", ZodFirstPartyTypeKind2.ZodArray = "ZodArray", ZodFirstPartyTypeKind2.ZodObject = "ZodObject", ZodFirstPartyTypeKind2.ZodUnion = "ZodUnion", ZodFirstPartyTypeKind2.ZodDiscriminatedUnion = "ZodDiscriminatedUnion", ZodFirstPartyTypeKind2.ZodIntersection = "ZodIntersection", ZodFirstPartyTypeKind2.ZodTuple = "ZodTuple", ZodFirstPartyTypeKind2.ZodRecord = "ZodRecord", ZodFirstPartyTypeKind2.ZodMap = "ZodMap", ZodFirstPartyTypeKind2.ZodSet = "ZodSet", ZodFirstPartyTypeKind2.ZodFunction = "ZodFunction", ZodFirstPartyTypeKind2.ZodLazy = "ZodLazy", ZodFirstPartyTypeKind2.ZodLiteral = "ZodLiteral", ZodFirstPartyTypeKind2.ZodEnum = "ZodEnum", ZodFirstPartyTypeKind2.ZodEffects = "ZodEffects", ZodFirstPartyTypeKind2.ZodNativeEnum = "ZodNativeEnum", ZodFirstPartyTypeKind2.ZodOptional = "ZodOptional", ZodFirstPartyTypeKind2.ZodNullable = "ZodNullable", ZodFirstPartyTypeKind2.ZodDefault = "ZodDefault", ZodFirstPartyTypeKind2.ZodCatch = "ZodCatch", ZodFirstPartyTypeKind2.ZodPromise = "ZodPromise", ZodFirstPartyTypeKind2.ZodBranded = "ZodBranded", ZodFirstPartyTypeKind2.ZodPipeline = "ZodPipeline", ZodFirstPartyTypeKind2.ZodReadonly = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params), stringType = ZodString.create, numberType = ZodNumber.create, nanType = ZodNaN.create, bigIntType = ZodBigInt.create, booleanType = ZodBoolean.create, dateType = ZodDate.create, symbolType = ZodSymbol.create, undefinedType = ZodUndefined.create, nullType = ZodNull.create, anyType = ZodAny.create, unknownType = ZodUnknown.create, neverType = ZodNever.create, voidType = ZodVoid.create, arrayType = ZodArray.create, objectType = ZodObject.create, strictObjectType = ZodObject.strictCreate, unionType = ZodUnion.create, discriminatedUnionType = ZodDiscriminatedUnion.create, intersectionType = ZodIntersection.create, tupleType = ZodTuple.create, recordType = ZodRecord.create, mapType = ZodMap.create, setType = ZodSet.create, functionType = ZodFunction.create, lazyType = ZodLazy.create, literalType = ZodLiteral.create, enumType = ZodEnum.create, nativeEnumType = ZodNativeEnum.create, promiseType = ZodPromise.create, effectsType = ZodEffects.create, optionalType = ZodOptional.create, nullableType = ZodNullable.create, preprocessType = ZodEffects.createWithPreprocess, pipelineType = ZodPipeline.create, ostring = () => stringType().optional(), onumber = () => numberType().optional(), oboolean = () => booleanType().optional(), coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: !0 })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: !0 })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: !0
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: !0 })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: !0 }))
};
var NEVER = INVALID;

// ../../packages/core/src/render/elements/schemas.ts
var EMPTY_ATTRIBUTES_SCHEMA = external_exports.object({}).passthrough(), optionalId = external_exports.string().min(1, { message: "id must be non-empty if present" }).optional(), AGENT_SLUG_REGEX = /^[a-z0-9-]+$/, optionalAgentSlug = external_exports.string().regex(AGENT_SLUG_REGEX, {
  message: "must be a lowercase slug (letters, digits, hyphens) matching the connector catalog's Agent.id"
}).optional(), BvBugAttributesSchema = external_exports.object({
  id: optionalId,
  severity: external_exports.enum(["low", "medium", "high", "critical"]).optional()
}).passthrough(), BvDecisionAttributesSchema = external_exports.object({ id: optionalId }).passthrough(), BvDiagramAttributesSchema = external_exports.object({
  title: external_exports.string().optional(),
  type: external_exports.enum(["mermaid", "plantuml", "ascii", "dot", "graphviz", "other"]).optional()
}).passthrough(), BvFactAttributesSchema = external_exports.object({
  category: external_exports.enum([
    "personal",
    "project",
    "preference",
    "convention",
    "team",
    "environment",
    "other"
  ]).optional(),
  // Per-fact disclosure policy (Phase 4). FAIL-CLOSED: any value other than
  // "public" — a typo, or absent — is treated as "restricted" by the
  // materializer, and `.catch` coerces a present-but-invalid value so a typo
  // never (a) slips through as public or (b) rejects the write.
  disclosure: external_exports.enum(["public", "restricted"]).catch("restricted").optional(),
  subject: external_exports.string().optional(),
  value: external_exports.string().optional()
}).passthrough(), BvFixAttributesSchema = external_exports.object({ id: optionalId }).passthrough(), BvPatternAttributesSchema = external_exports.object({
  description: external_exports.string().optional(),
  flags: external_exports.string().optional()
}).passthrough(), BvRuleAttributesSchema = external_exports.object({
  id: optionalId,
  severity: external_exports.enum(["info", "must", "should"]).optional()
}).passthrough(), RESERVED_TOPIC_ATTRIBUTES = ["importance", "maturity", "recency"], BvTopicAttributesSchema = external_exports.object({
  createdby: optionalAgentSlug,
  id: optionalId,
  keywords: external_exports.string().optional(),
  path: external_exports.string().min(1, { message: "path is required and must be non-empty" }),
  related: external_exports.string().optional(),
  summary: external_exports.string().optional(),
  tags: external_exports.string().optional(),
  title: external_exports.string().min(1, { message: "title is required and must be non-empty" }),
  updatedby: optionalAgentSlug,
  // Topic-level disclosure default (Phase 4). FAIL-CLOSED via `.catch`, like
  // a fact's `disclosure`. Excluded from the canonical hash (canonical.ts).
  visibility: external_exports.enum(["public", "restricted"]).catch("restricted").optional()
}).passthrough().superRefine((attrs, ctx) => {
  for (let key of RESERVED_TOPIC_ATTRIBUTES)
    key in attrs && ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: `\`${key}\` is a sidecar ranking signal and must not be set on <bv-topic>`,
      path: [key]
    });
}), ELEMENT_ATTRIBUTE_SCHEMAS = {
  "bv-author": EMPTY_ATTRIBUTES_SCHEMA,
  "bv-bug": BvBugAttributesSchema,
  "bv-changes": EMPTY_ATTRIBUTES_SCHEMA,
  "bv-decision": BvDecisionAttributesSchema,
  "bv-dependencies": EMPTY_ATTRIBUTES_SCHEMA,
  "bv-diagram": BvDiagramAttributesSchema,
  "bv-examples": EMPTY_ATTRIBUTES_SCHEMA,
  "bv-fact": BvFactAttributesSchema,
  "bv-files": EMPTY_ATTRIBUTES_SCHEMA,
  "bv-fix": BvFixAttributesSchema,
  "bv-flow": EMPTY_ATTRIBUTES_SCHEMA,
  "bv-highlights": EMPTY_ATTRIBUTES_SCHEMA,
  "bv-pattern": BvPatternAttributesSchema,
  "bv-reason": EMPTY_ATTRIBUTES_SCHEMA,
  "bv-rule": BvRuleAttributesSchema,
  "bv-structure": EMPTY_ATTRIBUTES_SCHEMA,
  "bv-task": EMPTY_ATTRIBUTES_SCHEMA,
  "bv-timestamp": EMPTY_ATTRIBUTES_SCHEMA,
  "bv-topic": BvTopicAttributesSchema
};

// ../../packages/core/src/render/elements/registry.ts
var ELEMENT_METADATA = {
  "bv-author": {
    allowedChildren: "inline",
    description: "The person or system identifier responsible for the concept (Raw Concept section).",
    optionalAttributes: [],
    requiredAttributes: []
  },
  "bv-bug": {
    allowedChildren: "block",
    description: "A bug runbook entry (symptom, root cause). Optional `id` and `severity` (low|medium|high|critical). Typically paired with a sibling `<bv-fix>`.",
    optionalAttributes: ["id", "severity"],
    requiredAttributes: []
  },
  "bv-changes": {
    allowedChildren: "block",
    description: "A list of changes (code, process, decision) in the Raw Concept section. Children should be `<li>` items.",
    optionalAttributes: [],
    requiredAttributes: []
  },
  "bv-decision": {
    allowedChildren: "block",
    description: "A decision record (with rationale and evidence). Optional `id` for cross-referencing.",
    optionalAttributes: ["id"],
    requiredAttributes: []
  },
  "bv-dependencies": {
    allowedChildren: "block",
    description: "Dependencies, prerequisites, blockers, or relationship information (Narrative section).",
    optionalAttributes: [],
    requiredAttributes: []
  },
  "bv-diagram": {
    allowedChildren: "block",
    description: "Preserves a diagram (mermaid / plantuml / ascii / dot) verbatim. Optional `type` declares the diagram language; optional `title` becomes the caption.",
    optionalAttributes: ["type", "title"],
    requiredAttributes: []
  },
  "bv-examples": {
    allowedChildren: "block",
    description: "Worked examples, sample code, or scenario walkthroughs (Narrative section).",
    optionalAttributes: [],
    requiredAttributes: []
  },
  "bv-fact": {
    allowedChildren: "inline",
    description: "A structured fact. Text content is the canonical statement; optional attributes carry the structured extraction (subject, category, value).",
    optionalAttributes: ["subject", "category", "value", "disclosure"],
    requiredAttributes: []
  },
  "bv-files": {
    allowedChildren: "block",
    description: "A list of related source files, documents, URLs, or references (Raw Concept section). Children should be `<li>` items.",
    optionalAttributes: [],
    requiredAttributes: []
  },
  "bv-fix": {
    allowedChildren: "block",
    description: "A fix runbook entry (steps to resolve a bug). Optional `id`. Typically the sibling of a `<bv-bug>`.",
    optionalAttributes: ["id"],
    requiredAttributes: []
  },
  "bv-flow": {
    allowedChildren: "inline",
    description: "A process flow, workflow, or sequence of steps (Raw Concept section).",
    optionalAttributes: [],
    requiredAttributes: []
  },
  "bv-highlights": {
    allowedChildren: "block",
    description: "Key highlights, capabilities, deliverables, or notable outcomes (Narrative section).",
    optionalAttributes: [],
    requiredAttributes: []
  },
  "bv-pattern": {
    allowedChildren: "inline",
    description: "A pattern (e.g. a regex) as the element's text content. Optional `flags` and `description` attributes carry the structured fields.",
    optionalAttributes: ["flags", "description"],
    requiredAttributes: []
  },
  "bv-reason": {
    allowedChildren: "block",
    description: `The curate operation's "why", stated for a human reviewer (Reason section).`,
    optionalAttributes: [],
    requiredAttributes: []
  },
  "bv-rule": {
    allowedChildren: "inline",
    description: "A rule the agent should follow. Optional `severity` (info|must|should) and `id` for cross-referencing.",
    optionalAttributes: ["severity", "id"],
    requiredAttributes: []
  },
  "bv-structure": {
    allowedChildren: "block",
    description: "Structural or organizational documentation (file layout, hierarchy) (Narrative section).",
    optionalAttributes: [],
    requiredAttributes: []
  },
  "bv-task": {
    allowedChildren: "inline",
    description: "The subject/task this concept relates to (Raw Concept section).",
    optionalAttributes: [],
    requiredAttributes: []
  },
  "bv-timestamp": {
    allowedChildren: "inline",
    description: "The date the concept's data represents (distinct from the system-set file timestamps) (Raw Concept section).",
    optionalAttributes: [],
    requiredAttributes: []
  },
  "bv-topic": {
    allowedChildren: "any",
    description: "Root container per topic file. Carries frontmatter as attributes. Required: `path`, `title`. Attribute names MUST be lowercase. Sidecar ranking signals (importance/maturity/recency) must NOT be set here; `createdat`/`updatedat` are system-stamped; `type` distinguishes topic/summary/context.",
    optionalAttributes: [
      "id",
      "summary",
      "tags",
      "keywords",
      "related",
      "type",
      "visibility"
    ],
    requiredAttributes: ["path", "title"]
  }
};
function buildRegistry() {
  let registry = {};
  for (let name of Object.keys(ELEMENT_METADATA))
    registry[name] = {
      ...ELEMENT_METADATA[name],
      name,
      validator: makeAttributeValidator(name, ELEMENT_ATTRIBUTE_SCHEMAS[name])
    };
  return registry;
}
var ELEMENT_REGISTRY = buildRegistry();

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/common/unicode.js
var UNDEFINED_CODE_POINTS = /* @__PURE__ */ new Set([
  65534,
  65535,
  131070,
  131071,
  196606,
  196607,
  262142,
  262143,
  327678,
  327679,
  393214,
  393215,
  458750,
  458751,
  524286,
  524287,
  589822,
  589823,
  655358,
  655359,
  720894,
  720895,
  786430,
  786431,
  851966,
  851967,
  917502,
  917503,
  983038,
  983039,
  1048574,
  1048575,
  1114110,
  1114111
]), REPLACEMENT_CHARACTER = "\uFFFD", CODE_POINTS;
(function(CODE_POINTS2) {
  CODE_POINTS2[CODE_POINTS2.EOF = -1] = "EOF", CODE_POINTS2[CODE_POINTS2.NULL = 0] = "NULL", CODE_POINTS2[CODE_POINTS2.TABULATION = 9] = "TABULATION", CODE_POINTS2[CODE_POINTS2.CARRIAGE_RETURN = 13] = "CARRIAGE_RETURN", CODE_POINTS2[CODE_POINTS2.LINE_FEED = 10] = "LINE_FEED", CODE_POINTS2[CODE_POINTS2.FORM_FEED = 12] = "FORM_FEED", CODE_POINTS2[CODE_POINTS2.SPACE = 32] = "SPACE", CODE_POINTS2[CODE_POINTS2.EXCLAMATION_MARK = 33] = "EXCLAMATION_MARK", CODE_POINTS2[CODE_POINTS2.QUOTATION_MARK = 34] = "QUOTATION_MARK", CODE_POINTS2[CODE_POINTS2.AMPERSAND = 38] = "AMPERSAND", CODE_POINTS2[CODE_POINTS2.APOSTROPHE = 39] = "APOSTROPHE", CODE_POINTS2[CODE_POINTS2.HYPHEN_MINUS = 45] = "HYPHEN_MINUS", CODE_POINTS2[CODE_POINTS2.SOLIDUS = 47] = "SOLIDUS", CODE_POINTS2[CODE_POINTS2.DIGIT_0 = 48] = "DIGIT_0", CODE_POINTS2[CODE_POINTS2.DIGIT_9 = 57] = "DIGIT_9", CODE_POINTS2[CODE_POINTS2.SEMICOLON = 59] = "SEMICOLON", CODE_POINTS2[CODE_POINTS2.LESS_THAN_SIGN = 60] = "LESS_THAN_SIGN", CODE_POINTS2[CODE_POINTS2.EQUALS_SIGN = 61] = "EQUALS_SIGN", CODE_POINTS2[CODE_POINTS2.GREATER_THAN_SIGN = 62] = "GREATER_THAN_SIGN", CODE_POINTS2[CODE_POINTS2.QUESTION_MARK = 63] = "QUESTION_MARK", CODE_POINTS2[CODE_POINTS2.LATIN_CAPITAL_A = 65] = "LATIN_CAPITAL_A", CODE_POINTS2[CODE_POINTS2.LATIN_CAPITAL_Z = 90] = "LATIN_CAPITAL_Z", CODE_POINTS2[CODE_POINTS2.RIGHT_SQUARE_BRACKET = 93] = "RIGHT_SQUARE_BRACKET", CODE_POINTS2[CODE_POINTS2.GRAVE_ACCENT = 96] = "GRAVE_ACCENT", CODE_POINTS2[CODE_POINTS2.LATIN_SMALL_A = 97] = "LATIN_SMALL_A", CODE_POINTS2[CODE_POINTS2.LATIN_SMALL_Z = 122] = "LATIN_SMALL_Z";
})(CODE_POINTS || (CODE_POINTS = {}));
var SEQUENCES = {
  DASH_DASH: "--",
  CDATA_START: "[CDATA[",
  DOCTYPE: "doctype",
  SCRIPT: "script",
  PUBLIC: "public",
  SYSTEM: "system"
};
function isSurrogate(cp) {
  return cp >= 55296 && cp <= 57343;
}
function isSurrogatePair(cp) {
  return cp >= 56320 && cp <= 57343;
}
function getSurrogatePairCodePoint(cp1, cp2) {
  return (cp1 - 55296) * 1024 + 9216 + cp2;
}
function isControlCodePoint(cp) {
  return cp !== 32 && cp !== 10 && cp !== 13 && cp !== 9 && cp !== 12 && cp >= 1 && cp <= 31 || cp >= 127 && cp <= 159;
}
function isUndefinedCodePoint(cp) {
  return cp >= 64976 && cp <= 65007 || UNDEFINED_CODE_POINTS.has(cp);
}

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/common/error-codes.js
var ERR;
(function(ERR2) {
  ERR2.controlCharacterInInputStream = "control-character-in-input-stream", ERR2.noncharacterInInputStream = "noncharacter-in-input-stream", ERR2.surrogateInInputStream = "surrogate-in-input-stream", ERR2.nonVoidHtmlElementStartTagWithTrailingSolidus = "non-void-html-element-start-tag-with-trailing-solidus", ERR2.endTagWithAttributes = "end-tag-with-attributes", ERR2.endTagWithTrailingSolidus = "end-tag-with-trailing-solidus", ERR2.unexpectedSolidusInTag = "unexpected-solidus-in-tag", ERR2.unexpectedNullCharacter = "unexpected-null-character", ERR2.unexpectedQuestionMarkInsteadOfTagName = "unexpected-question-mark-instead-of-tag-name", ERR2.invalidFirstCharacterOfTagName = "invalid-first-character-of-tag-name", ERR2.unexpectedEqualsSignBeforeAttributeName = "unexpected-equals-sign-before-attribute-name", ERR2.missingEndTagName = "missing-end-tag-name", ERR2.unexpectedCharacterInAttributeName = "unexpected-character-in-attribute-name", ERR2.unknownNamedCharacterReference = "unknown-named-character-reference", ERR2.missingSemicolonAfterCharacterReference = "missing-semicolon-after-character-reference", ERR2.unexpectedCharacterAfterDoctypeSystemIdentifier = "unexpected-character-after-doctype-system-identifier", ERR2.unexpectedCharacterInUnquotedAttributeValue = "unexpected-character-in-unquoted-attribute-value", ERR2.eofBeforeTagName = "eof-before-tag-name", ERR2.eofInTag = "eof-in-tag", ERR2.missingAttributeValue = "missing-attribute-value", ERR2.missingWhitespaceBetweenAttributes = "missing-whitespace-between-attributes", ERR2.missingWhitespaceAfterDoctypePublicKeyword = "missing-whitespace-after-doctype-public-keyword", ERR2.missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers = "missing-whitespace-between-doctype-public-and-system-identifiers", ERR2.missingWhitespaceAfterDoctypeSystemKeyword = "missing-whitespace-after-doctype-system-keyword", ERR2.missingQuoteBeforeDoctypePublicIdentifier = "missing-quote-before-doctype-public-identifier", ERR2.missingQuoteBeforeDoctypeSystemIdentifier = "missing-quote-before-doctype-system-identifier", ERR2.missingDoctypePublicIdentifier = "missing-doctype-public-identifier", ERR2.missingDoctypeSystemIdentifier = "missing-doctype-system-identifier", ERR2.abruptDoctypePublicIdentifier = "abrupt-doctype-public-identifier", ERR2.abruptDoctypeSystemIdentifier = "abrupt-doctype-system-identifier", ERR2.cdataInHtmlContent = "cdata-in-html-content", ERR2.incorrectlyOpenedComment = "incorrectly-opened-comment", ERR2.eofInScriptHtmlCommentLikeText = "eof-in-script-html-comment-like-text", ERR2.eofInDoctype = "eof-in-doctype", ERR2.nestedComment = "nested-comment", ERR2.abruptClosingOfEmptyComment = "abrupt-closing-of-empty-comment", ERR2.eofInComment = "eof-in-comment", ERR2.incorrectlyClosedComment = "incorrectly-closed-comment", ERR2.eofInCdata = "eof-in-cdata", ERR2.absenceOfDigitsInNumericCharacterReference = "absence-of-digits-in-numeric-character-reference", ERR2.nullCharacterReference = "null-character-reference", ERR2.surrogateCharacterReference = "surrogate-character-reference", ERR2.characterReferenceOutsideUnicodeRange = "character-reference-outside-unicode-range", ERR2.controlCharacterReference = "control-character-reference", ERR2.noncharacterCharacterReference = "noncharacter-character-reference", ERR2.missingWhitespaceBeforeDoctypeName = "missing-whitespace-before-doctype-name", ERR2.missingDoctypeName = "missing-doctype-name", ERR2.invalidCharacterSequenceAfterDoctypeName = "invalid-character-sequence-after-doctype-name", ERR2.duplicateAttribute = "duplicate-attribute", ERR2.nonConformingDoctype = "non-conforming-doctype", ERR2.missingDoctype = "missing-doctype", ERR2.misplacedDoctype = "misplaced-doctype", ERR2.endTagWithoutMatchingOpenElement = "end-tag-without-matching-open-element", ERR2.closingOfElementWithOpenChildElements = "closing-of-element-with-open-child-elements", ERR2.disallowedContentInNoscriptInHead = "disallowed-content-in-noscript-in-head", ERR2.openElementsLeftAfterEof = "open-elements-left-after-eof", ERR2.abandonedHeadElementChild = "abandoned-head-element-child", ERR2.misplacedStartTagForHeadElement = "misplaced-start-tag-for-head-element", ERR2.nestedNoscriptInHead = "nested-noscript-in-head", ERR2.eofInElementThatCanContainOnlyText = "eof-in-element-that-can-contain-only-text";
})(ERR || (ERR = {}));

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/tokenizer/preprocessor.js
var DEFAULT_BUFFER_WATERLINE = 65536, Preprocessor = class {
  constructor(handler) {
    this.handler = handler, this.html = "", this.pos = -1, this.lastGapPos = -2, this.gapStack = [], this.skipNextNewLine = !1, this.lastChunkWritten = !1, this.endOfChunkHit = !1, this.bufferWaterline = DEFAULT_BUFFER_WATERLINE, this.isEol = !1, this.lineStartPos = 0, this.droppedBufferSize = 0, this.line = 1, this.lastErrOffset = -1;
  }
  /** The column on the current line. If we just saw a gap (eg. a surrogate pair), return the index before. */
  get col() {
    return this.pos - this.lineStartPos + +(this.lastGapPos !== this.pos);
  }
  get offset() {
    return this.droppedBufferSize + this.pos;
  }
  getError(code, cpOffset) {
    let { line, col, offset } = this, startCol = col + cpOffset, startOffset = offset + cpOffset;
    return {
      code,
      startLine: line,
      endLine: line,
      startCol,
      endCol: startCol,
      startOffset,
      endOffset: startOffset
    };
  }
  _err(code) {
    this.handler.onParseError && this.lastErrOffset !== this.offset && (this.lastErrOffset = this.offset, this.handler.onParseError(this.getError(code, 0)));
  }
  _addGap() {
    this.gapStack.push(this.lastGapPos), this.lastGapPos = this.pos;
  }
  _processSurrogate(cp) {
    if (this.pos !== this.html.length - 1) {
      let nextCp = this.html.charCodeAt(this.pos + 1);
      if (isSurrogatePair(nextCp))
        return this.pos++, this._addGap(), getSurrogatePairCodePoint(cp, nextCp);
    } else if (!this.lastChunkWritten)
      return this.endOfChunkHit = !0, CODE_POINTS.EOF;
    return this._err(ERR.surrogateInInputStream), cp;
  }
  willDropParsedChunk() {
    return this.pos > this.bufferWaterline;
  }
  dropParsedChunk() {
    this.willDropParsedChunk() && (this.html = this.html.substring(this.pos), this.lineStartPos -= this.pos, this.droppedBufferSize += this.pos, this.pos = 0, this.lastGapPos = -2, this.gapStack.length = 0);
  }
  write(chunk2, isLastChunk) {
    this.html.length > 0 ? this.html += chunk2 : this.html = chunk2, this.endOfChunkHit = !1, this.lastChunkWritten = isLastChunk;
  }
  insertHtmlAtCurrentPos(chunk2) {
    this.html = this.html.substring(0, this.pos + 1) + chunk2 + this.html.substring(this.pos + 1), this.endOfChunkHit = !1;
  }
  startsWith(pattern, caseSensitive) {
    if (this.pos + pattern.length > this.html.length)
      return this.endOfChunkHit = !this.lastChunkWritten, !1;
    if (caseSensitive)
      return this.html.startsWith(pattern, this.pos);
    for (let i = 0; i < pattern.length; i++)
      if ((this.html.charCodeAt(this.pos + i) | 32) !== pattern.charCodeAt(i))
        return !1;
    return !0;
  }
  peek(offset) {
    let pos = this.pos + offset;
    if (pos >= this.html.length)
      return this.endOfChunkHit = !this.lastChunkWritten, CODE_POINTS.EOF;
    let code = this.html.charCodeAt(pos);
    return code === CODE_POINTS.CARRIAGE_RETURN ? CODE_POINTS.LINE_FEED : code;
  }
  advance() {
    if (this.pos++, this.isEol && (this.isEol = !1, this.line++, this.lineStartPos = this.pos), this.pos >= this.html.length)
      return this.endOfChunkHit = !this.lastChunkWritten, CODE_POINTS.EOF;
    let cp = this.html.charCodeAt(this.pos);
    return cp === CODE_POINTS.CARRIAGE_RETURN ? (this.isEol = !0, this.skipNextNewLine = !0, CODE_POINTS.LINE_FEED) : cp === CODE_POINTS.LINE_FEED && (this.isEol = !0, this.skipNextNewLine) ? (this.line--, this.skipNextNewLine = !1, this._addGap(), this.advance()) : (this.skipNextNewLine = !1, isSurrogate(cp) && (cp = this._processSurrogate(cp)), this.handler.onParseError === null || cp > 31 && cp < 127 || cp === CODE_POINTS.LINE_FEED || cp === CODE_POINTS.CARRIAGE_RETURN || cp > 159 && cp < 64976 || this._checkForProblematicCharacters(cp), cp);
  }
  _checkForProblematicCharacters(cp) {
    isControlCodePoint(cp) ? this._err(ERR.controlCharacterInInputStream) : isUndefinedCodePoint(cp) && this._err(ERR.noncharacterInInputStream);
  }
  retreat(count) {
    for (this.pos -= count; this.pos < this.lastGapPos; )
      this.lastGapPos = this.gapStack.pop(), this.pos--;
    this.isEol = !1;
  }
};

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/common/token.js
var TokenType;
(function(TokenType2) {
  TokenType2[TokenType2.CHARACTER = 0] = "CHARACTER", TokenType2[TokenType2.NULL_CHARACTER = 1] = "NULL_CHARACTER", TokenType2[TokenType2.WHITESPACE_CHARACTER = 2] = "WHITESPACE_CHARACTER", TokenType2[TokenType2.START_TAG = 3] = "START_TAG", TokenType2[TokenType2.END_TAG = 4] = "END_TAG", TokenType2[TokenType2.COMMENT = 5] = "COMMENT", TokenType2[TokenType2.DOCTYPE = 6] = "DOCTYPE", TokenType2[TokenType2.EOF = 7] = "EOF", TokenType2[TokenType2.HIBERNATION = 8] = "HIBERNATION";
})(TokenType || (TokenType = {}));
function getTokenAttr(token, attrName) {
  for (let i = token.attrs.length - 1; i >= 0; i--)
    if (token.attrs[i].name === attrName)
      return token.attrs[i].value;
  return null;
}

// ../../node_modules/.pnpm/entities@8.0.0/node_modules/entities/dist/decode-codepoint.js
var decodeMap = /* @__PURE__ */ new Map([
  [0, 65533],
  // C1 Unicode control character reference replacements
  [128, 8364],
  [130, 8218],
  [131, 402],
  [132, 8222],
  [133, 8230],
  [134, 8224],
  [135, 8225],
  [136, 710],
  [137, 8240],
  [138, 352],
  [139, 8249],
  [140, 338],
  [142, 381],
  [145, 8216],
  [146, 8217],
  [147, 8220],
  [148, 8221],
  [149, 8226],
  [150, 8211],
  [151, 8212],
  [152, 732],
  [153, 8482],
  [154, 353],
  [155, 8250],
  [156, 339],
  [158, 382],
  [159, 376]
]);
function replaceCodePoint(codePoint) {
  return codePoint >= 55296 && codePoint <= 57343 || codePoint > 1114111 ? 65533 : decodeMap.get(codePoint) ?? codePoint;
}

// ../../node_modules/.pnpm/entities@8.0.0/node_modules/entities/dist/internal/decode-shared.js
function decodeBase64(input) {
  let binary2 = atob(input), evenLength = binary2.length & -2, out = new Uint16Array(evenLength / 2);
  for (let index = 0, outIndex = 0; index < evenLength; index += 2) {
    let lo = binary2.charCodeAt(index), hi = binary2.charCodeAt(index + 1);
    out[outIndex++] = lo | hi << 8;
  }
  return out;
}

// ../../node_modules/.pnpm/entities@8.0.0/node_modules/entities/dist/generated/decode-data-html.js
var htmlDecodeTree = /* @__PURE__ */ decodeBase64("QR08ALkAAgH6AYsDNQR2BO0EPgXZBQEGLAbdBxMISQrvCmQLfQurDKQNLw4fD4YPpA+6D/IPAAAAAAAAAAAAAAAAKhBMEY8TmxUWF2EYLBkxGuAa3RsJHDscWR8YIC8jSCSIJcMl6ie3Ku8rEC0CLjoupS7kLgAIRU1hYmNmZ2xtbm9wcnN0dVQAWgBeAGUAaQBzAHcAfgCBAIQAhwCSAJoAoACsALMAbABpAGcAO4DGAMZAUAA7gCYAJkBjAHUAdABlADuAwQDBQHIiZXZlAAJhAAFpeW0AcgByAGMAO4DCAMJAEGRyAADgNdgE3XIAYQB2AGUAO4DAAMBA8CFoYZFj4SFjcgBhZAAAoFMqAAFncIsAjgBvAG4ABGFmAADgNdg43fAlbHlGdW5jdGlvbgCgYSBpAG4AZwA7gMUAxUAAAWNzpACoAHIAAOA12Jzc6SFnbgCgVCJpAGwAZABlADuAwwDDQG0AbAA7gMQAxEAABGFjZWZvcnN1xQDYANoA7QDxAPYA+QD8AAABY3LJAM8AayNzbGFzaAAAoBYidgHTANUAAKDnKmUAZAAAoAYjeQARZIABY3J0AOAA5QDrAGEidXNlAACgNSLuI291bGxpcwCgLCFhAJJjcgAA4DXYBd1wAGYAAOA12Dnd5SF2ZdhiYwDyAOoAbSJwZXEAAKBOIgAHSE9hY2RlZmhpbG9yc3UXARoBHwE6AVIBVQFiAWQBZgGCAakB6QHtAfIBYwB5ACdkUABZADuAqQCpQIABY3B5ACUBKAE1AfUhdGUGYWmg0iJ0KGFsRGlmZmVyZW50aWFsRAAAoEUhbCJleXMAAKAtIQACYWVpb0EBRAFKAU0B8iFvbgxhZABpAGwAO4DHAMdAcgBjAAhhbiJpbnQAAKAwIm8AdAAKYQABZG5ZAV0BaSJsbGEAuGB0I2VyRG90ALdg8gA5AWkAp2NyImNsZQAAAkRNUFRwAXQBeQF9AW8AdAAAoJkiaSJudXMAAKCWIuwhdXMAoJUiaSJtZXMAAKCXIm8AAAFjc4cBlAFrKndpc2VDb250b3VySW50ZWdyYWwAAKAyImUjQ3VybHkAAAFEUZwBpAFvJXVibGVRdW90ZQAAoB0gdSJvdGUAAKAZIAACbG5wdbABtgHNAdgBbwBuAGWgNyIAoHQqgAFnaXQAvAHBAcUB8iJ1ZW50AKBhIm4AdAAAoC8i7yV1ckludGVncmFsAKAuIgABZnLRAdMBAKACIe8iZHVjdACgECJuLnRlckNsb2Nrd2lzZUNvbnRvdXJJbnRlZ3JhbAAAoDMi7yFzcwCgLypjAHIAAOA12J7ccABDoNMiYQBwAACgTSKABURKU1phY2VmaW9zAAsCEgIVAhgCGwIsAjQCOQI9AnMCfwNvoEUh9CJyYWhkAKARKWMAeQACZGMAeQAFZGMAeQAPZIABZ3JzACECJQIoAuchZXIAoCEgcgAAoKEhaAB2AACg5CoAAWF5MAIzAvIhb24OYRRkbAB0oAciYQCUY3IAAOA12AfdAAFhZkECawIAAWNtRQJnAvIjaXRpY2FsAAJBREdUUAJUAl8CYwJjInV0ZQC0YG8AdAFZAloC2WJiJGxlQWN1dGUA3WJyImF2ZQBgYGkibGRlANxi7yFuZACgxCJmJWVyZW50aWFsRAAAoEYhcAR9AgAAAAAAAIECjgIAABoDZgAA4DXYO91EoagAhQKJAm8AdAAAoNwgcSJ1YWwAAKBQIuIhbGUAA0NETFJVVpkCqAK1Au8C/wIRA28AbgB0AG8AdQByAEkAbgB0AGUAZwByAGEA7ADEAW8AdAKvAgAAAACwAqhgbiNBcnJvdwAAoNMhAAFlb7kC0AJmAHQAgAFBUlQAwQLGAs0CciJyb3cAAKDQIekkZ2h0QXJyb3cAoNQhZQDlACsCbgBnAAABTFLWAugC5SFmdAABQVLcAuECciJyb3cAAKD4J+kkZ2h0QXJyb3cAoPon6SRnaHRBcnJvdwCg+SdpImdodAAAAUFU9gL7AnIicm93AACg0iFlAGUAAKCoInAAQQIGAwAAAAALA3Iicm93AACg0SFvJHduQXJyb3cAAKDVIWUlcnRpY2FsQmFyAACgJSJuAAADQUJMUlRhJAM2AzoDWgNxA3oDciJyb3cAAKGTIUJVLAMwA2EAcgAAoBMpcCNBcnJvdwAAoPUhciJldmUAEWPlIWZ00gJDAwAASwMAAFIDaSVnaHRWZWN0b3IAAKBQKWUkZVZlY3RvcgAAoF4p5SJjdG9yQqC9IWEAcgAAoFYpaSJnaHQA1AFiAwAAaQNlJGVWZWN0b3IAAKBfKeUiY3RvckKgwSFhAHIAAKBXKWUAZQBBoKQiciJyb3cAAKCnIXIAcgBvAPcAtAIAAWN0gwOHA3IAAOA12J/c8iFvaxBhAAhOVGFjZGZnbG1vcHFzdHV4owOlA6kDsAO/A8IDxgPNA9ID8gP9AwEEFAQeBCAEJQRHAEphSAA7gNAA0EBjAHUAdABlADuAyQDJQIABYWl5ALYDuQO+A/Ihb24aYXIAYwA7gMoAykAtZG8AdAAWYXIAAOA12AjdcgBhAHYAZQA7gMgAyEDlIm1lbnQAoAgiAAFhcNYD2QNjAHIAEmF0AHkAUwLhAwAAAADpA20lYWxsU3F1YXJlAACg+yVlJ3J5U21hbGxTcXVhcmUAAKCrJQABZ3D2A/kDbwBuABhhZgAA4DXYPN3zImlsb26VY3UAAAFhaQYEDgRsAFSgdSppImxkZQAAoEIi7CNpYnJpdW0AoMwhAAFjaRgEGwRyAACgMCFtAACgcyphAJdjbQBsADuAywDLQAABaXApBC0E8yF0cwCgAyLvJG5lbnRpYWxFAKBHIYACY2Zpb3MAPQQ/BEMEXQRyBHkAJGRyAADgNdgJ3WwibGVkAFMCTAQAAAAAVARtJWFsbFNxdWFyZQAAoPwlZSdyeVNtYWxsU3F1YXJlAACgqiVwA2UEAABpBAAAAABtBGYAAOA12D3dwSFsbACgACLyI2llcnRyZgCgMSFjAPIAcQQABkpUYWJjZGZnb3JzdIgEiwSOBJMElwSkBKcEqwStBLIE5QTqBGMAeQADZDuAPgA+QO0hbWFkoJMD3GNyImV2ZQAeYYABZWl5AJ0EoASjBOQhaWwiYXIAYwAcYRNkbwB0ACBhcgAA4DXYCt0AoNkicABmAADgNdg+3eUiYXRlcgADRUZHTFNUvwTIBM8E1QTZBOAEcSJ1YWwATKBlIuUhc3MAoNsidSRsbEVxdWFsAACgZyJyI2VhdGVyAACgoirlIXNzAKB3IuwkYW50RXF1YWwAoH4qaSJsZGUAAKBzImMAcgAA4DXYotwAoGsiAARBYWNmaW9zdfkE/QQFBQgFCwUTBSIFKwVSIkRjeQAqZAABY3QBBQQFZQBrAMdiXmDpIXJjJGFyAACgDCFsJWJlcnRTcGFjZQAAoAsh8AEYBQAAGwVmAACgDSHpJXpvbnRhbExpbmUAoAAlAAFjdCYFKAXyABIF8iFvayZhbQBwAEQBMQU5BW8AdwBuAEgAdQBtAPAAAAFxInVhbAAAoE8iAAdFSk9hY2RmZ21ub3N0dVMFVgVZBVwFYwVtBXAFcwV6BZAFtgXFBckFzQVjAHkAFWTsIWlnMmFjAHkAAWRjAHUAdABlADuAzQDNQAABaXlnBWwFcgBjADuAzgDOQBhkbwB0ADBhcgAAoBEhcgBhAHYAZQA7gMwAzEAAoREhYXB/BYsFAAFjZ4MFhQVyACphaSNuYXJ5SQAAoEghbABpAGUA8wD6AvQBlQUAAKUFZaAsIgABZ3KaBZ4F8iFhbACgKyLzI2VjdGlvbgCgwiJpI3NpYmxlAAABQ1SsBbEFbyJtbWEAAKBjIGkibWVzAACgYiCAAWdwdAC8Bb8FwwVvAG4ALmFmAADgNdhA3WEAmWNjAHIAAKAQIWkibGRlAChh6wHSBQAA1QVjAHkABmRsADuAzwDPQIACY2Zvc3UA4QXpBe0F8gX9BQABaXnlBegFcgBjADRhGWRyAADgNdgN3XAAZgAA4DXYQd3jAfcFAAD7BXIAAOA12KXc8iFjeQhk6yFjeQRkgANISmFjZm9zAAwGDwYSBhUGHQYhBiYGYwB5ACVkYwB5AAxk8CFwYZpjAAFleRkGHAbkIWlsNmEaZHIAAOA12A7dcABmAADgNdhC3WMAcgAA4DXYptyABUpUYWNlZmxtb3N0AD0GQAZDBl4GawZkB2gHcAd0B80H2gdjAHkACWQ7gDwAPECAAmNtbnByAEwGTwZSBlUGWwb1IXRlOWHiIWRhm2NnAACg6ifsI2FjZXRyZgCgEiFyAACgniGAAWFleQBkBmcGagbyIW9uPWHkIWlsO2EbZAABZnNvBjQHdAAABUFDREZSVFVWYXKABp4GpAbGBssG3AYDByEHwQIqBwABbnKEBowGZyVsZUJyYWNrZXQAAKDoJ/Ihb3cAoZAhQlKTBpcGYQByAACg5CHpJGdodEFycm93AKDGIWUjaWxpbmcAAKAII28A9QGqBgAAsgZiJWxlQnJhY2tldAAAoOYnbgDUAbcGAAC+BmUkZVZlY3RvcgAAoGEp5SJjdG9yQqDDIWEAcgAAoFkpbCJvb3IAAKAKI2kiZ2h0AAABQVbSBtcGciJyb3cAAKCUIeUiY3RvcgCgTikAAWVy4AbwBmUAAKGjIkFW5gbrBnIicm93AACgpCHlImN0b3IAoFopaSNhbmdsZQBCorIi+wYAAAAA/wZhAHIAAKDPKXEidWFsAACgtCJwAIABRFRWAAoHEQcYB+8kd25WZWN0b3IAoFEpZSRlVmVjdG9yAACgYCnlImN0b3JCoL8hYQByAACgWCnlImN0b3JCoLwhYQByAACgUilpAGcAaAB0AGEAcgByAG8A9wDMAnMAAANFRkdMU1Q/B0cHTgdUB1gHXwfxJXVhbEdyZWF0ZXIAoNoidSRsbEVxdWFsAACgZiJyI2VhdGVyAACgdiLlIXNzAKChKuwkYW50RXF1YWwAoH0qaSJsZGUAAKByInIAAOA12A/dZaDYIuYjdGFycm93AKDaIWkiZG90AD9hgAFucHcAege1B7kHZwAAAkxSbHKCB5QHmwerB+UhZnQAAUFSiAeNB3Iicm93AACg9SfpJGdodEFycm93AKD3J+kkZ2h0QXJyb3cAoPYn5SFmdAABYXLcAqEHaQBnAGgAdABhAHIAcgBvAPcA5wJpAGcAaAB0AGEAcgByAG8A9wDuAmYAAOA12EPdZQByAAABTFK/B8YHZSRmdEFycm93AACgmSHpJGdodEFycm93AKCYIYABY2h0ANMH1QfXB/IAWgYAoLAh8iFva0FhAKBqIgAEYWNlZmlvc3XpB+wH7gf/BwMICQgOCBEIcAAAoAUpeQAcZAABZGzyB/kHaSR1bVNwYWNlAACgXyBsI2ludHJmAACgMyFyAADgNdgQ3e4jdXNQbHVzAKATInAAZgAA4DXYRN1jAPIA/gecY4AESmFjZWZvc3R1ACEIJAgoCDUIgQiFCDsKQApHCmMAeQAKZGMidXRlAENhgAFhZXkALggxCDQI8iFvbkdh5CFpbEVhHWSAAWdzdwA7CGEIfQjhInRpdmWAAU1UVgBECEwIWQhlJWRpdW1TcGFjZQAAoAsgaABpAAABY25SCFMIawBTAHAAYQBjAOUASwhlAHIAeQBUAGgAaQDuAFQI9CFlZAABR0xnCHUIcgBlAGEAdABlAHIARwByAGUAYQB0AGUA8gDrBGUAcwBzAEwAZQBzAPMA2wdMImluZQAKYHIAAOA12BHdAAJCbnB0jAiRCJkInAhyImVhawAAoGAgwiZyZWFraW5nU3BhY2WgYGYAAKAVIUOq7CqzCMIIzQgAAOcIGwkAAAAAAAAtCQAAbwkAAIcJAACdCcAJGQoAADQKAAFvdbYIvAjuI2dydWVudACgYiJwIkNhcAAAoG0ibyh1YmxlVmVydGljYWxCYXIAAKAmIoABbHF4ANII1wjhCOUibWVudACgCSL1IWFsVKBgImkibGRlAADgQiI4A2kic3RzAACgBCJyI2VhdGVyAACjbyJFRkdMU1T1CPoIAgkJCQ0JFQlxInVhbAAAoHEidSRsbEVxdWFsAADgZyI4A3IjZWF0ZXIAAOBrIjgD5SFzcwCgeSLsJGFudEVxdWFsAOB+KjgDaSJsZGUAAKB1IvUhbXBEASAJJwnvI3duSHVtcADgTiI4A3EidWFsAADgTyI4A2UAAAFmczEJRgn0JFRyaWFuZ2xlQqLqIj0JAAAAAEIJYQByAADgzyk4A3EidWFsAACg7CJzAICibiJFR0xTVABRCVYJXAlhCWkJcSJ1YWwAAKBwInIjZWF0ZXIAAKB4IuUhc3MA4GoiOAPsJGFudEVxdWFsAOB9KjgDaSJsZGUAAKB0IuUic3RlZAABR0x1CX8J8iZlYXRlckdyZWF0ZXIA4KIqOAPlI3NzTGVzcwDgoSo4A/IjZWNlZGVzAKGAIkVTjwmVCXEidWFsAADgryo4A+wkYW50RXF1YWwAoOAiAAFlaaAJqQl2JmVyc2VFbGVtZW50AACgDCLnJWh0VHJpYW5nbGVCousitgkAAAAAuwlhAHIAAODQKTgDcSJ1YWwAAKDtIgABcXXDCeAJdSNhcmVTdQAAAWJwywnVCfMhZXRF4I8iOANxInVhbAAAoOIi5SJyc2V0ReCQIjgDcSJ1YWwAAKDjIoABYmNwAOYJ8AkNCvMhZXRF4IIi0iBxInVhbAAAoIgi4yJlZWRzgKGBIkVTVAD6CQAKBwpxInVhbAAA4LAqOAPsJGFudEVxdWFsAKDhImkibGRlAADgfyI4A+UicnNldEXggyLSIHEidWFsAACgiSJpImxkZQCAoUEiRUZUACIKJwouCnEidWFsAACgRCJ1JGxsRXF1YWwAAKBHImkibGRlAACgSSJlJXJ0aWNhbEJhcgAAoCQiYwByAADgNdip3GkAbABkAGUAO4DRANFAnWMAB0VhY2RmZ21vcHJzdHV2XgphCmgKcgp2CnoKgQqRCpYKqwqtCrsKyArNCuwhaWdSYWMAdQB0AGUAO4DTANNAAAFpeWwKcQpyAGMAO4DUANRAHmRiImxhYwBQYXIAAOA12BLdcgBhAHYAZQA7gNIA0kCAAWFlaQCHCooKjQpjAHIATGFnAGEAqWNjInJvbgCfY3AAZgAA4DXYRt3lI25DdXJseQABRFGeCqYKbyV1YmxlUXVvdGUAAKAcIHUib3RlAACgGCAAoFQqAAFjbLEKtQpyAADgNdiq3GEAcwBoADuA2ADYQGkAbAHACsUKZABlADuA1QDVQGUAcwAAoDcqbQBsADuA1gDWQGUAcgAAAUJQ0wrmCgABYXLXCtoKcgAAoD4gYQBjAAABZWvgCuIKAKDeI2UAdAAAoLQjYSVyZW50aGVzaXMAAKDcI4AEYWNmaGlsb3JzAP0KAwsFCwkLCwsMCxELIwtaC3IjdGlhbEQAAKACInkAH2RyAADgNdgT3WkApmOgY/Ujc01pbnVzsWAAAWlwFQsgC24AYwBhAHIAZQBwAGwAYQBuAOUACgVmAACgGSGAobsqZWlvACoLRQtJC+MiZWRlc4CheiJFU1QANAs5C0ALcSJ1YWwAAKCvKuwkYW50RXF1YWwAoHwiaSJsZGUAAKB+Im0AZQAAoDMgAAFkcE0LUQv1IWN0AKAPIm8jcnRpb24AYaA3ImwAAKAdIgABY2leC2ILcgAA4DXYq9yoYwACVWZvc2oLbwtzC3cLTwBUADuAIgAiQHIAAOA12BTdcABmAACgGiFjAHIAAOA12KzcAAZCRWFjZWZoaW9yc3WPC5MLlwupC7YL2AvbC90LhQyTDJoMowzhIXJyAKAQKUcAO4CuAK5AgAFjbnIAnQugC6ML9SF0ZVRhZwAAoOsncgB0oKAhbAAAoBYpgAFhZXkArwuyC7UL8iFvblhh5CFpbFZhIGR2oBwhZSJyc2UAAAFFVb8LzwsAAWxxwwvIC+UibWVudACgCyL1JGlsaWJyaXVtAKDLIXAmRXF1aWxpYnJpdW0AAKBvKXIAAKAcIW8AoWPnIWh0AARBQ0RGVFVWYewLCgwQDDIMNwxeDHwM9gIAAW5y8Av4C2clbGVCcmFja2V0AACg6SfyIW93AKGSIUJM/wsDDGEAcgAAoOUhZSRmdEFycm93AACgxCFlI2lsaW5nAACgCSNvAPUBFgwAAB4MYiVsZUJyYWNrZXQAAKDnJ24A1AEjDAAAKgxlJGVWZWN0b3IAAKBdKeUiY3RvckKgwiFhAHIAAKBVKWwib29yAACgCyMAAWVyOwxLDGUAAKGiIkFWQQxGDHIicm93AACgpiHlImN0b3IAoFspaSNhbmdsZQBCorMiVgwAAAAAWgxhAHIAAKDQKXEidWFsAACgtSJwAIABRFRWAGUMbAxzDO8kd25WZWN0b3IAoE8pZSRlVmVjdG9yAACgXCnlImN0b3JCoL4hYQByAACgVCnlImN0b3JCoMAhYQByAACgUykAAXB1iQyMDGYAAKAdIe4kZEltcGxpZXMAoHAp6SRnaHRhcnJvdwCg2yEAAWNongyhDHIAAKAbIQCgsSHsJGVEZWxheWVkAKD0KYAGSE9hY2ZoaW1vcXN0dQC/DMgMzAzQDOIM5gwKDQ0NFA0ZDU8NVA1YDQABQ2PDDMYMyCFjeSlkeQAoZEYiVGN5ACxkYyJ1dGUAWmEAorwqYWVpedgM2wzeDOEM8iFvbmBh5CFpbF5hcgBjAFxhIWRyAADgNdgW3e8hcnQAAkRMUlXvDPYM/QwEDW8kd25BcnJvdwAAoJMhZSRmdEFycm93AACgkCHpJGdodEFycm93AKCSIXAjQXJyb3cAAKCRIechbWGjY+EkbGxDaXJjbGUAoBgicABmAADgNdhK3XICHw0AAAAAIg10AACgGiLhIXJlgKGhJUlTVQAqDTINSg3uJXRlcnNlY3Rpb24AoJMidQAAAWJwNw1ADfMhZXRFoI8icSJ1YWwAAKCRIuUicnNldEWgkCJxInVhbAAAoJIibiJpb24AAKCUImMAcgAA4DXYrtxhAHIAAKDGIgACYmNtcF8Nag2ODZANc6DQImUAdABFoNAicSJ1YWwAAKCGIgABY2huDYkNZSJlZHMAgKF7IkVTVAB4DX0NhA1xInVhbAAAoLAq7CRhbnRFcXVhbACgfSJpImxkZQAAoH8iVABoAGEA9ADHCwCgESIAodEiZXOVDZ8NciJzZXQARaCDInEidWFsAACghyJlAHQAAKDRIoAFSFJTYWNmaGlvcnMAtQ27Db8NyA3ODdsN3w3+DRgOHQ4jDk8AUgBOADuA3gDeQMEhREUAoCIhAAFIY8MNxg1jAHkAC2R5ACZkAAFidcwNzQ0JYKRjgAFhZXkA1A3XDdoN8iFvbmRh5CFpbGJhImRyAADgNdgX3QABZWnjDe4N8gHoDQAA7Q3lImZvcmUAoDQiYQCYYwABY27yDfkNayNTcGFjZQAA4F8gCiDTInBhY2UAoAkg7CFkZYChPCJFRlQABw4MDhMOcSJ1YWwAAKBDInUkbGxFcXVhbAAAoEUiaSJsZGUAAKBIInAAZgAA4DXYS93pI3BsZURvdACg2yAAAWN0Jw4rDnIAAOA12K/c8iFva2Zh4QpFDlYOYA5qDgAAbg5yDgAAAAAAAAAAAAB5DnwOqA6zDgAADg8RDxYPGg8AAWNySA5ODnUAdABlADuA2gDaQHIAb6CfIeMhaXIAoEkpcgDjAVsOAABdDnkADmR2AGUAbGEAAWl5Yw5oDnIAYwA7gNsA20AjZGIibGFjAHBhcgAA4DXYGN1yAGEAdgBlADuA2QDZQOEhY3JqYQABZGl/Dp8OZQByAAABQlCFDpcOAAFhcokOiw5yAF9gYQBjAAABZWuRDpMOAKDfI2UAdAAAoLUjYSVyZW50aGVzaXMAAKDdI28AbgBQoMMi7CF1cwCgjiIAAWdwqw6uDm8AbgByYWYAAOA12EzdAARBREVUYWRwc78O0g7ZDuEOBQPqDvMOBw9yInJvdwDCoZEhyA4AAMwOYQByAACgEilvJHduQXJyb3cAAKDFIW8kd25BcnJvdwAAoJUhcSV1aWxpYnJpdW0AAKBuKWUAZQBBoKUiciJyb3cAAKClIW8AdwBuAGEAcgByAG8A9wAQA2UAcgAAAUxS+Q4AD2UkZnRBcnJvdwAAoJYh6SRnaHRBcnJvdwCglyFpAGyg0gNvAG4ApWPpIW5nbmFjAHIAAOA12LDcaSJsZGUAaGFtAGwAO4DcANxAgAREYmNkZWZvc3YALQ8xDzUPNw89D3IPdg97D4AP4SFzaACgqyJhAHIAAKDrKnkAEmThIXNobKCpIgCg5ioAAWVyQQ9DDwCgwSKAAWJ0eQBJD00Paw9hAHIAAKAWIGmgFiDjIWFsAAJCTFNUWA9cD18PZg9hAHIAAKAjIukhbmV8YGUkcGFyYXRvcgAAoFgnaSJsZGUAAKBAItQkaGluU3BhY2UAoAogcgAA4DXYGd1wAGYAAOA12E3dYwByAADgNdix3GQiYXNoAACgqiKAAmNlZm9zAI4PkQ+VD5kPng/pIXJjdGHkIWdlAKDAInIAAOA12BrdcABmAADgNdhO3WMAcgAA4DXYstwAAmZpb3OqD64Prw+0D3IAAOA12BvdnmNwAGYAAOA12E/dYwByAADgNdiz3IAEQUlVYWNmb3N1AMgPyw/OD9EP2A/gD+QP6Q/uD2MAeQAvZGMAeQAHZGMAeQAuZGMAdQB0AGUAO4DdAN1AAAFpedwP3w9yAGMAdmErZHIAAOA12BzdcABmAADgNdhQ3WMAcgAA4DXYtNxtAGwAeGEABEhhY2RlZm9z/g8BEAUQDRAQEB0QIBAkEGMAeQAWZGMidXRlAHlhAAFheQkQDBDyIW9ufWEXZG8AdAB7YfIBFRAAABwQbwBXAGkAZAB0AOgAVAhhAJZjcgAAoCghcABmAACgJCFjAHIAAOA12LXc4QtCEEkQTRAAAGcQbRByEAAAAAAAAAAAeRCKEJcQ8hD9EAAAGxEhETIROREAAD4RYwB1AHQAZQA7gOEA4UByImV2ZQADYYCiPiJFZGl1eQBWEFkQWxBgEGUQAOA+IjMDAKA/InIAYwA7gOIA4kB0AGUAO4C0ALRAMGRsAGkAZwA7gOYA5kByoGEgAOA12B7dcgBhAHYAZQA7gOAA4EAAAWVwfBCGEAABZnCAEIQQ8yF5bQCgNSHoAIMQaABhALFjAAFhcI0QWwAAAWNskRCTEHIAAWFnAACgPypkApwQAAAAALEQAKInImFkc3ajEKcQqRCuEG4AZAAAoFUqAKBcKmwib3BlAACgWCoAoFoqAKMgImVsbXJzersQvRDAEN0Q5RDtEACgpCllAACgICJzAGQAYaAhImEEzhDQENIQ1BDWENgQ2hDcEACgqCkAoKkpAKCqKQCgqykAoKwpAKCtKQCgrikAoK8pdAB2oB8iYgBkoL4iAKCdKQABcHTpEOwQaAAAoCIixWDhIXJyAKB8IwABZ3D1EPgQbwBuAAVhZgAA4DXYUt0Ao0giRWFlaW9wBxEJEQ0RDxESERQRAKBwKuMhaXIAoG8qAKBKImQAAKBLInMAJ2DyIW94ZaBIIvEADhFpAG4AZwA7gOUA5UCAAWN0eQAmESoRKxFyAADgNdi23CpgbQBwAGWgSCLxAPgBaQBsAGQAZQA7gOMA40BtAGwAO4DkAORAAAFjaUERRxFvAG4AaQBuAPQA6AFuAHQAAKARKgAITmFiY2RlZmlrbG5vcHJzdWQRaBGXEZ8RpxGrEdIR1hErEjASexKKEn0RThNbE3oTbwB0AACg7SoAAWNybBGJEWsAAAJjZXBzdBF4EX0RghHvIW5nAKBMInAjc2lsb24A9mNyImltZQAAoDUgaQBtAGWgPSJxAACgzSJ2AY0RkRFlAGUAAKC9ImUAZABnoAUjZQAAoAUjcgBrAHSgtSPiIXJrAKC2IwABb3mjEaYRbgDnAHcRMWTxIXVvAKAeIIACY21wcnQAtBG5Eb4RwRHFEeEhdXPloDUi5ABwInR5dgAAoLApcwDpAH0RbgBvAPUA6gCAAWFodwDLEcwRzhGyYwCgNiHlIWVuAKBsInIAAOA12B/dZwCAA2Nvc3R1dncA4xHyEQUSEhIhEiYSKRKAAWFpdQDpEesR7xHwAKMFcgBjAACg7yVwAACgwyKAAWRwdAD4EfwRABJvAHQAAKAAKuwhdXMAoAEqaSJtZXMAAKACKnECCxIAAAAADxLjIXVwAKAGKmEAcgAAoAUm8iNpYW5nbGUAAWR1GhIeEu8hd24AoL0lcAAAoLMlcCJsdXMAAKAEKmUA5QBCD+UAkg9hInJvdwAAoA0pgAFha28ANhJoEncSAAFjbjoSZRJrAIABbHN0AEESRxJNEm8jemVuZ2UAAKDrKXEAdQBhAHIA5QBcBPIjaWFuZ2xlgKG0JWRscgBYElwSYBLvIXduAKC+JeUhZnQAoMIlaSJnaHQAAKC4JWsAAKAjJLEBbRIAAHUSsgFxEgAAcxIAoJIlAKCRJTQAAKCTJWMAawAAoIglAAFlb38ShxJx4D0A5SD1IWl2AOBhIuUgdAAAoBAjAAJwdHd4kRKVEpsSnxJmAADgNdhT3XSgpSJvAG0AAKClIvQhaWUAoMgiAAZESFVWYmRobXB0dXayEsES0RLgEvcS+xIKExoTHxMjEygTNxMAAkxSbHK5ErsSvRK/EgCgVyUAoFQlAKBWJQCgUyUAolAlRFVkdckSyxLNEs8SAKBmJQCgaSUAoGQlAKBnJQACTFJsctgS2hLcEt4SAKBdJQCgWiUAoFwlAKBZJQCjUSVITFJobHLrEu0S7xLxEvMS9RIAoGwlAKBjJQCgYCUAoGslAKBiJQCgXyVvAHgAAKDJKQACTFJscgITBBMGEwgTAKBVJQCgUiUAoBAlAKAMJQCiACVEVWR1EhMUExYTGBMAoGUlAKBoJQCgLCUAoDQlaSJudXMAAKCfIuwhdXMAoJ4iaSJtZXMAAKCgIgACTFJsci8TMRMzEzUTAKBbJQCgWCUAoBglAKAUJQCjAiVITFJobHJCE0QTRhNIE0oTTBMAoGolAKBhJQCgXiUAoDwlAKAkJQCgHCUAAWV2UhNVE3YA5QD5AGIAYQByADuApgCmQAACY2Vpb2ITZhNqE24TcgAA4DXYt9xtAGkAAKBPIG0A5aA9IogRbAAAoVwAYmh0E3YTAKDFKfMhdWIAoMgnbAF+E4QTbABloCIgdAAAoCIgcAAAoU4iRWWJE4sTAKCuKvGgTyI8BeEMqRMAAN8TABQDFB8UAAAjFDQUAAAAAIUUAAAAAI0UAAAAANcU4xT3FPsUAACIFQAAlhWAAWNwcgCuE7ET1RP1IXRlB2GAoikiYWJjZHMAuxO/E8QTzhPSE24AZAAAoEQqciJjdXAAAKBJKgABYXXIE8sTcAAAoEsqcAAAoEcqbwB0AACgQCoA4CkiAP4AAWVv2RPcE3QAAKBBIO4ABAUAAmFlaXXlE+8T9RP4E/AB6hMAAO0TcwAAoE0qbwBuAA1hZABpAGwAO4DnAOdAcgBjAAlhcABzAHOgTCptAACgUCpvAHQAC2GAAWRtbgAIFA0UEhRpAGwAO4C4ALhAcCJ0eXYAAKCyKXQAAIGiADtlGBQZFKJAcgBkAG8A9ABiAXIAAOA12CDdgAFjZWkAKBQqFDIUeQBHZGMAawBtoBMn4SFyawCgEyfHY3IAAKPLJUVjZWZtcz8UQRRHFHcUfBSAFACgwykAocYCZWxGFEkUcQAAoFciZQBhAlAUAAAAAGAUciJyb3cAAAFsclYUWhTlIWZ0AKC6IWkiZ2h0AACguyGAAlJTYWNkAGgUaRRrFG8UcxSuYACgyCRzAHQAAKCbIukhcmMAoJoi4SFzaACgnSJuImludAAAoBAqaQBkAACg7yrjIWlyAKDCKfUhYnN1oGMmaQB0AACgYybsApMUmhS2FAAAwxRvAG4AZaA6APGgVCKrAG0CnxQAAAAAoxRhAHSgLABAYAChASJmbKcUqRTuABMNZQAAAW14rhSyFOUhbnQAoAEiZQDzANIB5wG6FAAAwBRkoEUibwB0AACgbSpuAPQAzAGAAWZyeQDIFMsUzhQA4DXYVN1vAOQA1wEAgakAO3MeAdMUcgAAoBchAAFhb9oU3hRyAHIAAKC1IXMAcwAAoBcnAAFjdeYU6hRyAADgNdi43AABYnDuFPIUZaDPKgCg0SploNAqAKDSKuQhb3QAoO8igANkZWxwcnZ3AAYVEBUbFSEVRBVlFYQV4SFycgABbHIMFQ4VAKA4KQCgNSlwAhYVAAAAABkVcgAAoN4iYwAAoN8i4SFycnCgtiEAoD0pgKIqImJjZG9zACsVMBU6FT4VQRVyImNhcAAAoEgqAAFhdTQVNxVwAACgRipwAACgSipvAHQAAKCNInIAAKBFKgDgKiIA/gACYWxydksVURVuFXMVcgByAG2gtyEAoDwpeQCAAWV2dwBYFWUVaRVxAHACXxUAAAAAYxVyAGUA4wAXFXUA4wAZFWUAZQAAoM4iZSJkZ2UAAKDPImUAbgA7gKQApEBlI2Fycm93AAABbHJ7FX8V5SFmdACgtiFpImdodAAAoLchZQDkAG0VAAFjaYsVkRVvAG4AaQBuAPQAkwFuAHQAAKAxImwiY3R5AACgLSOACUFIYWJjZGVmaGlqbG9yc3R1d3oAuBW7Fb8V1RXgFegV+RUKFhUWHxZUFlcWZRbFFtsW7xb7FgUXChdyAPIAtAJhAHIAAKBlKQACZ2xyc8YVyhXOFdAV5yFlcgCgICDlIXRoAKA4IfIA9QxoAHagECAAoKMiawHZFd4VYSJyb3cAAKAPKWEA4wBfAgABYXnkFecV8iFvbg9hNGQAoUYhYW/tFfQVAAFnciEC8RVyAACgyiF0InNlcQAAoHcqgAFnbG0A/xUCFgUWO4CwALBAdABhALRjcCJ0eXYAAKCxKQABaXIOFhIW8yFodACgfykA4DXYId1hAHIAAAFschsWHRYAoMMhAKDCIYACYWVnc3YAKBauAjYWOhY+Fm0AAKHEIm9zLhY0Fm4AZABzoMQi9SFpdACgZiZhIm1tYQDdY2kAbgAAoPIiAKH3AGlvQxZRFmQAZQAAgfcAO29KFksW90BuI3RpbWVzAACgxyJuAPgAUBZjAHkAUmRjAG8CXhYAAAAAYhZyAG4AAKAeI28AcAAAoA0jgAJscHR1dwBuFnEWdRaSFp4W7CFhciRgZgAA4DXYVd0AotkCZW1wc30WhBaJFo0WcQBkoFAibwB0AACgUSJpIm51cwAAoDgi7CF1cwCgFCLxInVhcmUAoKEiYgBsAGUAYgBhAHIAdwBlAGQAZwDlANcAbgCAAWFkaAClFqoWtBZyAHIAbwD3APUMbwB3AG4AYQByAHIAbwB3APMA8xVhI3Jwb29uAAABbHK8FsAWZQBmAPQAHBZpAGcAaAD0AB4WYgHJFs8WawBhAHIAbwD3AJILbwLUFgAAAADYFnIAbgAAoB8jbwBwAACgDCOAAWNvdADhFukW7BYAAXJ55RboFgDgNdi53FVkbAAAoPYp8iFvaxFhAAFkcvMW9xZvAHQAAKDxImkA5qC/JVsSAAFhaP8WAhdyAPIANQNhAPIA1wvhIm5nbGUAoKYpAAFjaQ4XEBd5AF9k5yJyYXJyAKD/JwAJRGFjZGVmZ2xtbm9wcXJzdHV4MRc4F0YXWxcyBF4XaRd5F40XrBe0F78X2RcVGCEYLRg1GEAYAAFEbzUXgRZvAPQA+BUAAWNzPBdCF3UAdABlADuA6QDpQPQhZXIAoG4qAAJhaW95TRdQF1YXWhfyIW9uG2FyAGOgViI7gOoA6kDsIW9uAKBVIk1kbwB0ABdhAAFEcmIXZhdvAHQAAKBSIgDgNdgi3XKhmipuF3QXYQB2AGUAO4DoAOhAZKCWKm8AdAAAoJgqgKGZKmlscwCAF4UXhxfuInRlcnMAoOcjAKATIWSglSpvAHQAAKCXKoABYXBzAJMXlheiF2MAcgATYXQAeQBzogUinxcAAAAAoRdlAHQAAKAFInAAMaADIDMBqRerFwCgBCAAoAUgAAFnc7AXsRdLYXAAAKACIAABZ3C4F7sXbwBuABlhZgAA4DXYVt2AAWFscwDFF8sXzxdyAHOg1SJsAACg4yl1AHMAAKBxKmkAAKG1A2x21RfYF28AbgC1Y/VjAAJjc3V24BfoF/0XEBgAAWlv5BdWF3IAYwAAoFYiaQLuFwAAAADwF+0ADQThIW50AAFnbPUX+Rd0AHIAAKCWKuUhc3MAoJUqgAFhZWkAAxgGGAoYbABzAD1gcwB0AACgXyJ2AESgYSJEAACgeCrwImFyc2wAoOUpAAFEYRkYHRhvAHQAAKBTInIAcgAAoHEpgAFjZGkAJxgqGO0XcgAAoC8hbwD0AIwCAAFhaDEYMhi3YzuA8ADwQAABbXI5GD0YbAA7gOsA60BvAACgrCCAAWNpcABGGEgYSxhsACFgcwD0ACwEAAFlb08YVxhjAHQAYQB0AGkAbwDuABoEbgBlAG4AdABpAGEAbADlADME4Ql1GAAAgRgAAIMYiBgAAAAAoRilGAAAqhgAALsYvhjRGAAA1xgnGWwAbABpAG4AZwBkAG8AdABzAGUA8QBlF3kARGRtImFsZQAAoEAmgAFpbHIAjRiRGJ0Y7CFpZwCgA/tpApcYAAAAAJoYZwAAoAD7aQBnAACgBPsA4DXYI93sIWlnAKAB++whaWcA4GYAagCAAWFsdACvGLIYthh0AACgbSZpAGcAAKAC+24AcwAAoLElbwBmAJJh8AHCGAAAxhhmAADgNdhX3QABYWvJGMwYbADsAGsEdqDUIgCg2SphI3J0aW50AACgDSoAAWFv2hgiGQABY3PeGB8ZsQPnGP0YBRkSGRUZAAAdGbID7xjyGPQY9xj5GAAA+xg7gL0AvUAAoFMhO4C8ALxAAKBVIQCgWSEAoFshswEBGQAAAxkAoFQhAKBWIbQCCxkOGQAAAAAQGTuAvgC+QACgVyEAoFwhNQAAoFghtgEZGQAAGxkAoFohAKBdITgAAKBeIWwAAKBEIHcAbgAAoCIjYwByAADgNdi73IAIRWFiY2RlZmdpamxub3JzdHYARhlKGVoZXhlmGWkZkhmWGZkZnRmgGa0ZxhnLGc8Z4BkjGmygZyIAoIwqgAFjbXAAUBlTGVgZ9SF0ZfVhbQBhAOSgswM6FgCghipyImV2ZQAfYQABaXliGWUZcgBjAB1hM2RvAHQAIWGAoWUibHFzAMYEcBl6GfGhZSLOBAAAdhlsAGEAbgD0AN8EgKF+KmNkbACBGYQZjBljAACgqSpvAHQAb6CAKmyggioAoIQqZeDbIgD+cwAAoJQqcgAA4DXYJN3noGsirATtIWVsAKA3IWMAeQBTZIChdyJFYWoApxmpGasZAKCSKgCgpSoAoKQqAAJFYWVztBm2Gb0ZwhkAoGkicABwoIoq8iFveACgiipxoIgq8aCIKrUZaQBtAACg5yJwAGYAAOA12FjdYQB2AOUAYwIAAWNp0xnWGXIAAKAKIW0AAKFzImVs3BneGQCgjioAoJAqAIM+ADtjZGxxco0E6xn0GfgZ/BkBGgABY2nvGfEZAKCnKnIAAKB6Km8AdAAAoNci0CFhcgCglSl1ImVzdAAAoHwqgAJhZGVscwAKGvQZFhrVBCAa8AEPGgAAFBpwAHIAbwD4AFkZcgAAoHgpcQAAAWxxxAQbGmwAZQBzAPMASRlpAO0A5AQAAWVuJxouGnIjdG5lcXEAAOBpIgD+xQAsGgAFQWFiY2Vma29zeUAaQxpmGmoabRqDGocalhrCGtMacgDyAMwCAAJpbG1yShpOGlAaVBpyAHMA8ABxD2YAvWBpAGwA9AASBQABZHJYGlsaYwB5AEpkAKGUIWN3YBpkGmkAcgAAoEgpAKCtIWEAcgAAoA8h6SFyYyVhgAFhbHIAcxp7Gn8a8iF0c3WgZSZpAHQAAKBlJuwhaXAAoCYg4yFvbgCguSJyAADgNdgl3XMAAAFld4wakRphInJvdwAAoCUpYSJyb3cAAKAmKYACYW1vcHIAnxqjGqcauhq+GnIAcgAAoP8h9CFodACgOyJrAAABbHKsGrMaZSRmdGFycm93AACgqSHpJGdodGFycm93AKCqIWYAAOA12Fnd4iFhcgCgFSCAAWNsdADIGswa0BpyAADgNdi93GEAcwDoAGka8iFvaydhAAFicNca2xr1IWxsAKBDIOghZW4AoBAg4Qr2GgAA/RoAAAgbExsaGwAAIRs7GwAAAAA+G2IbmRuVG6sbAACyG80b0htjAHUAdABlADuA7QDtQAChYyBpeQEbBhtyAGMAO4DuAO5AOGQAAWN4CxsNG3kANWRjAGwAO4ChAKFAAAFmcssCFhsA4DXYJt1yAGEAdgBlADuA7ADsQIChSCFpbm8AJxsyGzYbAAFpbisbLxtuAHQAAKAMKnQAAKAtIuYhaW4AoNwpdABhAACgKSHsIWlnM2GAAWFvcABDG1sbXhuAAWNndABJG0sbWRtyACthgAFlbHAAcQVRG1UbaQBuAOUAyAVhAHIA9AByBWgAMWFmAACgtyJlAGQAtWEAoggiY2ZvdGkbbRt1G3kb4SFyZQCgBSFpAG4AdKAeImkAZQAAoN0pZABvAPQAWxsAoisiY2VscIEbhRuPG5QbYQBsAACguiIAAWdyiRuNG2UAcgDzACMQ4wCCG2EicmhrAACgFyryIW9kAKA8KgACY2dwdJ8boRukG6gbeQBRZG8AbgAvYWYAAOA12FrdYQC5Y3UAZQBzAHQAO4C/AL9AAAFjabUbuRtyAADgNdi+3G4AAKIIIkVkc3bCG8QbyBvQAwCg+SJvAHQAAKD1Inag9CIAoPMiaaBiIOwhZGUpYesB1hsAANkbYwB5AFZkbAA7gO8A70AAA2NmbW9zdeYb7hvyG/Ub+hsFHAABaXnqG+0bcgBjADVhOWRyAADgNdgn3eEhdGg3YnAAZgAA4DXYW93jAf8bAAADHHIAAOA12L/c8iFjeVhk6yFjeVRkAARhY2ZnaGpvcxUcGhwiHCYcKhwtHDAcNRzwIXBhdqC6A/BjAAFleR4cIRzkIWlsN2E6ZHIAAOA12CjdciJlZW4AOGFjAHkARWRjAHkAXGRwAGYAAOA12FzdYwByAADgNdjA3IALQUJFSGFiY2RlZmdoamxtbm9wcnN0dXYAXhxtHHEcdRx5HN8cBx0dHTwd3B3tHfEdAR4EHh0eLB5FHrwewx7hHgkfPR9LH4ABYXJ0AGQcZxxpHHIA8gBvB/IAxQLhIWlsAKAbKeEhcnIAoA4pZ6BmIgCgiyphAHIAAKBiKWMJjRwAAJAcAACVHAAAAAAAAAAAAACZHJwcAACmHKgcrRwAANIc9SF0ZTph7SJwdHl2AKC0KXIAYQDuAFoG4iFkYbtjZwAAoegnZGyhHKMcAKCRKeUAiwYAoIUqdQBvADuAqwCrQHIAgKOQIWJmaGxwc3QAuhy/HMIcxBzHHMoczhxmoOQhcwAAoB8pcwAAoB0p6wCyGnAAAKCrIWwAAKA5KWkAbQAAoHMpbAAAoKIhAKGrKmFl1hzaHGkAbAAAoBkpc6CtKgDgrSoA/oABYWJyAOUc6RztHHIAcgAAoAwpcgBrAACgcicAAWFr8Rz4HGMAAAFla/Yc9xx7YFtgAAFlc/wc/hwAoIspbAAAAWR1Ax0FHQCgjykAoI0pAAJhZXV5Dh0RHRodHB3yIW9uPmEAAWRpFR0YHWkAbAA8YewAowbiAPccO2QAAmNxcnMkHScdLB05HWEAAKA2KXUAbwDyoBwgqhEAAWR1MB00HeghYXIAoGcpcyJoYXIAAKBLKWgAAKCyIQCiZCJmZ3FzRB1FB5Qdnh10AIACYWhscnQATh1WHWUdbB2NHXIicm93AHSgkCFhAOkAzxxhI3Jwb29uAAABZHVeHWId7yF3bgCgvSFwAACgvCHlJGZ0YXJyb3dzAKDHIWkiZ2h0AIABYWhzAHUdex2DHXIicm93APOglCGdBmEAcgBwAG8AbwBuAPMAzgtxAHUAaQBnAGEAcgByAG8A9wBlGugkcmVldGltZXMAoMsi8aFkIk0HAACaHWwAYQBuAPQAXgcAon0qY2Rnc6YdqR2xHbcdYwAAoKgqbwB0AG+gfypyoIEqAKCDKmXg2iIA/nMAAKCTKoACYWRlZ3MAwB3GHcod1h3ZHXAAcAByAG8A+ACmHG8AdAAAoNYicQAAAWdxzx3SHXQA8gBGB2cAdADyAHQcdADyAFMHaQDtAGMHgAFpbHIA4h3mHeod8yFodACgfClvAG8A8gDKBgDgNdgp3UWgdiIAoJEqYQH1Hf4dcgAAAWR1YB35HWygvCEAoGopbABrAACghCVjAHkAWWQAomoiYWNodAweDx4VHhkecgDyAGsdbwByAG4AZQDyAGAW4SFyZACgaylyAGkAAKD6JQABaW8hHiQe5CFvdEBh9SFzdGGgsCPjIWhlAKCwIwACRWFlczMeNR48HkEeAKBoInAAcKCJKvIhb3gAoIkqcaCHKvGghyo0HmkAbQAAoOYiAARhYm5vcHR3elIeXB5fHoUelh6mHqsetB4AAW5yVh5ZHmcAAKDsJ3IAAKD9IXIA6wCwBmcAgAFsbXIAZh52Hnse5SFmdAABYXKIB2weaQBnAGgAdABhAHIAcgBvAPcAkwfhInBzdG8AoPwnaQBnAGgAdABhAHIAcgBvAPcAmgdwI2Fycm93AAABbHKNHpEeZQBmAPQAxhxpImdodAAAoKwhgAFhZmwAnB6fHqIecgAAoIUpAOA12F3ddQBzAACgLSppIm1lcwAAoDQqYQGvHrMecwB0AACgFyLhAIoOZaHKJbkeRhLuIWdlAKDKJWEAcgBsoCgAdAAAoJMpgAJhY2htdADMHs8e1R7bHt0ecgDyAJ0GbwByAG4AZQDyANYWYQByAGSgyyEAoG0pAKAOIHIAaQAAoL8iAANhY2hpcXTrHu8e1QfzHv0eBh/xIXVvAKA5IHIAAOA12MHcbQDloXIi+h4AAPweAKCNKgCgjyoAAWJ19xwBH28AcqAYIACgGiDyIW9rQmEAhDwAO2NkaGlscXJCBhcfxh0gHyQfKB8sHzEfAAFjaRsfHR8AoKYqcgAAoHkqcgBlAOUAkx3tIWVzAKDJIuEhcnIAoHYpdSJlc3QAAKB7KgABUGk1HzkfYQByAACglillocMlAgdfEnIAAAFkdUIfRx9zImhhcgAAoEop6CFhcgCgZikAAWVuTx9WH3IjdG5lcXEAAOBoIgD+xQBUHwAHRGFjZGVmaGlsbm9wc3VuH3Ifoh+rH68ftx+7H74f5h/uH/MfBwj/HwsgxCFvdACgOiIAAmNscHJ5H30fiR+eH3IAO4CvAK9AAAFldIEfgx8AoEImZaAgJ3MAZQAAoCAnc6CmIXQAbwCAoaYhZGx1AJQfmB+cH28AdwDuAHkDZQBmAPQA6gbwAOkO6yFlcgCgriUAAW95ph+qH+0hbWEAoCkqPGThIXNoAKAUIOElc3VyZWRhbmdsZQCgISJyAADgNdgq3W8AAKAnIYABY2RuAMQfyR/bH3IAbwA7gLUAtUBhoiMi0B8AANMf1x9zAPQAKxFpAHIAAKDwKm8AdAA7gLcAt0B1AHMA4qESIh4TAADjH3WgOCIAoCoqYwHqH+0fcAAAoNsq8gB+GnAAbAB1APMACAgAAWRw9x/7H+UhbHMAoKciZgAA4DXYXt0AAWN0AyAHIHIAAOA12MLc8CFvcwCgPiJsobwDECAVIPQiaW1hcACguCJhAPAAEyAADEdMUlZhYmNkZWZnaGlqbG1vcHJzdHV2dzwgRyBmIG0geSCqILgg2iDeIBEhFSEyIUMhTSFQIZwhnyHSIQAiIyKLIrEivyIUIwABZ3RAIEMgAODZIjgD9uBrItIgBwmAAWVsdABNIF8gYiBmAHQAAAFhclMgWCByInJvdwAAoM0h6SRnaHRhcnJvdwCgziEA4NgiOAP24Goi0iBfCekkZ2h0YXJyb3cAoM8hAAFEZHEgdSDhIXNoAKCvIuEhc2gAoK4igAJiY25wdACCIIYgiSCNIKIgbABhAACgByL1IXRlRGFnAADgICLSIACiSSJFaW9wlSCYIJwgniAA4HAqOANkAADgSyI4A3MASWFyAG8A+AAyCnUAcgBhoG4mbADzoG4mmwjzAa8gAACzIHAAO4CgAKBAbQBwAOXgTiI4AyoJgAJhZW91eQDBIMogzSDWINkg8AHGIAAAyCAAoEMqbwBuAEhh5CFpbEZhbgBnAGSgRyJvAHQAAOBtKjgDcAAAoEIqPWThIXNoAKATIACjYCJBYWRxc3jpIO0g+SD+IAIhDCFyAHIAAKDXIXIAAAFocvIg9SBrAACgJClvoJch9wAGD28AdAAA4FAiOAN1AGkA9gC7CAABZWkGIQohYQByAACgKCntAN8I6SFzdPOgBCLlCHIAAOA12CvdAAJFZXN0/wgcISshLiHxoXEiIiEAABMJ8aFxIgAJAAAnIWwAYQBuAPQAEwlpAO0AGQlyoG8iAKBvIoABQWFwADghOyE/IXIA8gBeIHIAcgAAoK4hYQByAACg8ipzogsiSiEAAAAAxwtkoPwiAKD6ImMAeQBaZIADQUVhZGVzdABcIV8hYiFmIWkhkyGWIXIA8gBXIADgZiI4A3IAcgAAoJohcgAAoCUggKFwImZxcwBwIYQhjiF0AAABYXJ1IXohcgByAG8A9wBlIWkAZwBoAHQAYQByAHIAbwD3AD4h8aFwImAhAACKIWwAYQBuAPQAZwlz4H0qOAMAoG4iaQDtAG0JcqBuImkA5aDqIkUJaQDkADoKAAFwdKMhpyFmAADgNdhf3YCBrAA7aW4AriGvIcchrEBuAIChCSJFZHYAtyG6Ib8hAOD5IjgDbwB0AADg9SI4A+EB1gjEIcYhAKD3IgCg9iJpAHagDCLhAagJzyHRIQCg/iIAoP0igAFhb3IA2CHsIfEhcgCAoSYiYXN0AOAh5SHpIWwAbABlAOwAywhsAADg/SrlIADgAiI4A2wiaW50AACgFCrjoYAi9yEAAPohdQDlAJsJY+CvKjgDZaCAIvEAkwkAAkFhaXQHIgoiFyIeInIA8gBsIHIAcgAAoZshY3cRIhQiAOAzKTgDAOCdITgDZyRodGFycm93AACgmyFyAGkA5aDrIr4JgANjaGltcHF1AC8iPCJHIpwhTSJQIloigKGBImNlcgA2Iv0JOSJ1AOUABgoA4DXYw9zvIXJ0bQKdIQAAAABEImEAcgDhAOEhbQBloEEi8aBEIiYKYQDyAMsIcwB1AAABYnBWIlgi5QDUCeUA3wmAAWJjcABgInMieCKAoYQiRWVzAGci7glqIgDgxSo4A2UAdABl4IIi0iBxAPGgiCJoImMAZaCBIvEA/gmAoYUiRWVzAH8iFgqCIgDgxio4A2UAdABl4IMi0iBxAPGgiSKAIgACZ2lscpIilCKaIpwi7AAMCWwAZABlADuA8QDxQOcAWwlpI2FuZ2xlAAABbHKkIqoi5SFmdGWg6iLxAEUJaSJnaHQAZaDrIvEAvgltoL0DAKEjAGVzuCK8InIAbwAAoBYhcAAAoAcggARESGFkZ2lscnMAziLSItYi2iLeIugi7SICIw8j4SFzaACgrSLhIXJyAKAEKXAAAOBNItIg4SFzaACgrCIAAWV04iLlIgDgZSLSIADgPgDSIG4iZmluAACg3imAAUFldADzIvci+iJyAHIAAKACKQDgZCLSIHLgPADSIGkAZQAA4LQi0iAAAUF0BiMKI3IAcgAAoAMp8iFpZQDgtSLSIGkAbQAA4Dwi0iCAAUFhbgAaIx4jKiNyAHIAAKDWIXIAAAFociMjJiNrAACgIylvoJYh9wD/DuUhYXIAoCcpUxJqFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVCMAAF4jaSN/I4IjjSOeI8AUAAAAAKYjwCMAANoj3yMAAO8jHiQvJD8kRCQAAWNzVyNsFHUAdABlADuA8wDzQAABaXlhI2cjcgBjoJoiO4D0APRAPmSAAmFiaW9zAHEjdCN3I3EBeiNzAOgAdhTsIWFjUWF2AACgOCrvIWxkAKC8KewhaWdTYQABY3KFI4kjaQByAACgvykA4DXYLN1vA5QjAAAAAJYjAACcI24A22JhAHYAZQA7gPIA8kAAoMEpAAFibaEjjAphAHIAAKC1KQACYWNpdKwjryO6I70jcgDyAFkUAAFpcrMjtiNyAACgvinvIXNzAKC7KW4A5QDZCgCgwCmAAWFlaQDFI8gjyyNjAHIATWFnAGEAyWOAAWNkbgDRI9Qj1iPyIW9uv2MAoLYpdQDzAHgBcABmAADgNdhg3YABYWVsAOQj5yPrI3IAAKC3KXIAcAAAoLkpdQDzAHwBAKMoImFkaW9zdvkj/CMPJBMkFiQbJHIA8gBeFIChXSplZm0AAyQJJAwkcgBvoDQhZgAAoDQhO4CqAKpAO4C6ALpA5yFvZgCgtiJyAACgVipsIm9wZQAAoFcqAKBbKoABY2xvACMkJSQrJPIACCRhAHMAaAA7gPgA+EBsAACgmCJpAGwBMyQ4JGQAZQA7gPUA9UBlAHMAYaCXInMAAKA2Km0AbAA7gPYA9kDiIWFyAKA9I+EKXiQAAHokAAB8JJQkAACYJKkkAAAAALUkEQsAAPAkAAAAAAQleiUAAIMlcgCAoSUiYXN0AGUkbyQBCwCBtgA7bGokayS2QGwAZQDsABgDaQJ1JAAAAAB4JG0AAKDzKgCg/Sp5AD9kcgCAAmNpbXB0AIUkiCSLJJkSjyRuAHQAJWBvAGQALmBpAGwAAKAwIOUhbmsAoDEgcgAA4DXYLd2AAWltbwCdJKAkpCR2oMYD1WNtAGEA9AD+B24AZQAAoA4m9KHAA64kAAC0JGMjaGZvcmsAAKDUItZjAAFhdbgkxCRuAAABY2u9JMIkawBooA8hAKAOIfYAaRpzAACkKwBhYmNkZW1zdNMkIRPXJNsk4STjJOck6yTjIWlyAKAjKmkAcgAAoCIqAAFvdYsW3yQAoCUqAKByKm4AO4CxALFAaQBtAACgJip3AG8AAKAnKoABaXB1APUk+iT+JO4idGludACgFSpmAADgNdhh3W4AZAA7gKMAo0CApHoiRWFjZWlub3N1ABMlFSUYJRslTCVRJVklSSV1JQCgsypwAACgtyp1AOUAPwtjoK8qgKJ6ImFjZW5zACclLSU0JTYlSSVwAHAAcgBvAPgAFyV1AHIAbAB5AGUA8QA/C/EAOAuAAWFlcwA8JUElRSXwInByb3gAoLkqcQBxAACgtSppAG0AAKDoImkA7QBEC20AZQDzoDIgIguAAUVhcwBDJVclRSXwAEAlgAFkZnAATwtfJXElgAFhbHMAZSVpJW0l7CFhcgCgLiPpIW5lAKASI/UhcmYAoBMjdKAdIu8AWQvyIWVsAKCwIgABY2l9JYElcgAA4DXYxdzIY24iY3NwAACgCCAAA2Zpb3BzdZElKxuVJZolnyWkJXIAAOA12C7dcABmAADgNdhi3XIiaW1lAACgVyBjAHIAAOA12MbcgAFhZW8AqiW6JcAldAAAAWVpryW2JXIAbgBpAG8AbgDzABkFbgB0AACgFipzAHQAZaA/APEACRj0AG0LgApBQkhhYmNkZWZoaWxtbm9wcnN0dXgA4yXyJfYl+iVpJpAmpia9JtUm5ib4JlonaCdxJ3UnnietJ7EnyCfiJ+cngAFhcnQA6SXsJe4lcgDyAJkM8gD6AuEhaWwAoBwpYQByAPIA3BVhAHIAAKBkKYADY2RlbnFydAAGJhAmEyYYJiYmKyZaJgABZXUKJg0mAOA9IjEDdABlAFVhaQDjACAN7SJwdHl2AKCzKWcAgKHpJ2RlbAAgJiImJCYAoJIpAKClKeUA9wt1AG8AO4C7ALtAcgAApZIhYWJjZmhscHN0dz0mQCZFJkcmSiZMJk4mUSZVJlgmcAAAoHUpZqDlIXMAAKAgKQCgMylzAACgHinrALka8ACVHmwAAKBFKWkAbQAAoHQpbAAAoKMhAKCdIQABYWleJmImaQBsAACgGilvAG6gNiJhAGwA8wB2C4ABYWJyAG8mciZ2JnIA8gAvEnIAawAAoHMnAAFha3omgSZjAAABZWt/JoAmfWBdYAABZXOFJocmAKCMKWwAAAFkdYwmjiYAoI4pAKCQKQACYWV1eZcmmiajJqUm8iFvbllhAAFkaZ4moSZpAGwAV2HsAA8M4gCAJkBkAAJjbHFzrSawJrUmuiZhAACgNylkImhhcgAAoGkpdQBvAPKgHSCjAWgAAKCzIYABYWNnAMMm0iaUC2wAgKEcIWlwcwDLJs4migxuAOUAoAxhAHIA9ADaC3QAAKCtJYABaWxyANsm3ybjJvMhaHQAoH0pbwBvAPIANgwA4DXYL90AAWFv6ib1JnIAAAFkde8m8SYAoMEhbKDAIQCgbCl2oMED8WOAAWducwD+Jk4nUCdoAHQAAANhaGxyc3QKJxInISc1Jz0nRydyInJvdwB0oJIhYQDpAFYmYSNycG9vbgAAAWR1GiceJ28AdwDuAPAmcAAAoMAh5SFmdAABYWgnJy0ncgByAG8AdwDzAAkMYQByAHAAbwBvAG4A8wATBGklZ2h0YXJyb3dzAACgySFxAHUAaQBnAGEAcgByAG8A9wBZJugkcmVldGltZXMAoMwiZwDaYmkAbgBnAGQAbwB0AHMAZQDxABwYgAFhaG0AYCdjJ2YncgDyAAkMYQDyABMEAKAPIG8idXN0AGGgsSPjIWhlAKCxI+0haWQAoO4qAAJhYnB0fCeGJ4knmScAAW5ygCeDJ2cAAKDtJ3IAAKD+IXIA6wAcDIABYWZsAI8nkieVJ3IAAKCGKQDgNdhj3XUAcwAAoC4qaSJtZXMAAKA1KgABYXCiJ6gncgBnoCkAdAAAoJQp7yJsaW50AKASKmEAcgDyADwnAAJhY2hxuCe8J6EMwCfxIXVvAKA6IHIAAOA12MfcAAFidYAmxCdvAPKgGSCoAYABaGlyAM4n0ifWJ3IAZQDlAE0n7SFlcwCgyiJpAIChuSVlZmwAXAxjEt4n9CFyaQCgzinsInVoYXIAoGgpAKAeIWENBSgJKA0oSyhVKIYoAACLKLAoAAAAAOMo5ygAABApJCkxKW0pcSmHKaYpAACYKgAAAACxKmMidXRlAFthcQB1AO8ABR+ApHsiRWFjZWlucHN5ABwoHignKCooLygyKEEoRihJKACgtCrwASMoAAAlKACguCpvAG4AYWF1AOUAgw1koLAqaQBsAF9hcgBjAF1hgAFFYXMAOCg6KD0oAKC2KnAAAKC6KmkAbQAAoOki7yJsaW50AKATKmkA7QCIDUFkbwB0AGKixSKRFgAAAABTKACgZiqAA0FhY21zdHgAYChkKG8ocyh1KHkogihyAHIAAKDYIXIAAAFocmkoayjrAJAab6CYIfcAzAd0ADuApwCnQGkAO2D3IWFyAKApKW0AAAFpbn4ozQBuAHUA8wDOAHQAAKA2J3IA7+A12DDdIxkAAmFjb3mRKJUonSisKHIAcAAAoG8mAAFoeZkonChjAHkASWRIZHIAdABtAqUoAAAAAKgoaQDkAFsPYQByAGEA7ABsJDuArQCtQAABZ22zKLsobQBhAAChwwNmdroouijCY4CjPCJkZWdsbnByAMgozCjPKNMo1yjaKN4obwB0AACgairxoEMiCw5FoJ4qAKCgKkWgnSoAoJ8qZQAAoEYi7CF1cwCgJCrhIXJyAKByKWEAcgDyAPwMAAJhZWl07Sj8KAEpCCkAAWxz8Sj4KGwAcwBlAHQAbQDpAH8oaABwAACgMyrwImFyc2wAoOQpAAFkbFoPBSllAACgIyNloKoqc6CsKgDgrCoA/oABZmxwABUpGCkfKfQhY3lMZGKgLwBhoMQpcgAAoD8jZgAA4DXYZN1hAAABZHIoKRcDZQBzAHWgYCZpAHQAAKBgJoABY3N1ADYpRilhKQABYXU6KUApcABzoJMiAOCTIgD+cABzoJQiAOCUIgD+dQAAAWJwSylWKQChjyJlcz4NUCllAHQAZaCPIvEAPw0AoZAiZXNIDVspZQB0AGWgkCLxAEkNAKGhJWFmZilbBHIAZQFrKVwEAKChJWEAcgDyAAMNAAJjZW10dyl7KX8pgilyAADgNdjI3HQAbQDuAM4AaQDsAAYpYQByAOYAVw0AAWFyiimOKXIA5qAGJhESAAFhbpIpoylpImdodAAAAWVwmSmgKXAAcwBpAGwAbwDuANkXaADpAKAkcwCvYIACYmNtbnAArin8KY4NJSooKgCkgiJFZGVtbnByc7wpvinCKcgpzCnUKdgp3CkAoMUqbwB0AACgvSpkoIYibwB0AACgwyr1IWx0AKDBKgABRWXQKdIpAKDLKgCgiiLsIXVzAKC/KuEhcnIAoHkpgAFlaXUA4inxKfQpdAAAoYIiZW7oKewpcQDxoIYivSllAHEA8aCKItEpbQAAoMcqAAFicPgp+ikAoNUqAKDTKmMAgKJ7ImFjZW5zAAcqDSoUKhYqRihwAHAAcgBvAPgAIyh1AHIAbAB5AGUA8QCDDfEAfA2AAWFlcwAcKiIqPShwAHAAcgBvAPgAPChxAPEAOShnAACgaiYApoMiMTIzRWRlaGxtbnBzPCo/KkIqRSpHKlIqWCpjKmcqaypzKncqO4C5ALlAO4CyALJAO4CzALNAAKDGKgABb3NLKk4qdAAAoL4qdQBiAACg2CpkoIcibwB0AACgxCpzAAABb3VdKmAqbAAAoMknYgAAoNcq4SFycgCgeyn1IWx0AKDCKgABRWVvKnEqAKDMKgCgiyLsIXVzAKDAKoABZWl1AH0qjCqPKnQAAKGDImVugyqHKnEA8aCHIkYqZQBxAPGgiyJwKm0AAKDIKgABYnCTKpUqAKDUKgCg1iqAAUFhbgCdKqEqrCpyAHIAAKDZIXIAAAFocqYqqCrrAJUab6CZIfcAxQf3IWFyAKAqKWwAaQBnADuA3wDfQOELzyrZKtwq6SrsKvEqAAD1KjQrAAAAAAAAAAAAAEwrbCsAAHErvSsAAAAAAADRK3IC1CoAAAAA2CrnIWV0AKAWI8RjcgDrAOUKgAFhZXkA4SrkKucq8iFvbmVh5CFpbGNhQmRvAPQAIg5sInJlYwAAoBUjcgAA4DXYMd0AAmVpa2/7KhIrKCsuK/IBACsAAAkrZQAAATRm6g0EK28AcgDlAOsNYQBzorgDECsAAAAAEit5AG0A0WMAAWNuFislK2sAAAFhcxsrIStwAHAAcgBvAPgAFw5pAG0AAKA8InMA8AD9DQABYXMsKyEr8AAXDnIAbgA7gP4A/kDsATgrOyswG2QA5QBnAmUAcwCAgdcAO2JkAEMrRCtJK9dAYaCgInIAAKAxKgCgMCqAAWVwcwBRK1MraSvhAAkh4qKkIlsrXysAAAAAYytvAHQAAKA2I2kAcgAAoPEqb+A12GXdcgBrAACg2irhAHgociJpbWUAAKA0IIABYWlwAHYreSu3K2QA5QC+DYADYWRlbXBzdACFK6MrmiunK6wrsCuzK24iZ2xlAACitSVkbHFykCuUK5ornCvvIXduAKC/JeUhZnRloMMl8QACBwCgXCJpImdodABloLkl8QBdDG8AdAAAoOwlaSJudXMAAKA6KuwhdXMAoDkqYgAAoM0p6SFtZQCgOyrlInppdW0AoOIjgAFjaHQAwivKK80rAAFyecYrySsA4DXYydxGZGMAeQBbZPIhb2tnYQABaW/UK9creAD0ANERaCJlYWQAAAFsct4r5ytlAGYAdABhAHIAcgBvAPcAXQbpJGdodGFycm93AKCgIQAJQUhhYmNkZmdobG1vcHJzdHV3CiwNLBEsHSwnLDEsQCxLLFIsYix6LIQsjyzLLOgs7Sz/LAotcgDyAAkDYQByAACgYykAAWNyFSwbLHUAdABlADuA+gD6QPIACQ1yAOMBIywAACUseQBeZHYAZQBtYQABaXkrLDAscgBjADuA+wD7QENkgAFhYmgANyw6LD0scgDyANEO7CFhY3FhYQDyAOAOAAFpckQsSCzzIWh0AKB+KQDgNdgy3XIAYQB2AGUAO4D5APlAYQFWLF8scgAAAWxyWixcLACgvyEAoL4hbABrAACggCUAAWN0Zix2LG8CbCwAAAAAcyxyAG4AZaAcI3IAAKAcI28AcAAAoA8jcgBpAACg+CUAAWFsfiyBLGMAcgBrYTuAqACoQAABZ3CILIssbwBuAHNhZgAA4DXYZt0AA2FkaGxzdZksniynLLgsuyzFLHIAcgBvAPcACQ1vAHcAbgBhAHIAcgBvAPcA2A5hI3Jwb29uAAABbHKvLLMsZQBmAPQAWyxpAGcAaAD0AF0sdQDzAKYOaQAAocUDaGzBLMIs0mNvAG4AxWPwI2Fycm93cwCgyCGAAWNpdADRLOEs5CxvAtcsAAAAAN4scgBuAGWgHSNyAACgHSNvAHAAAKAOI24AZwBvYXIAaQAAoPklYwByAADgNdjK3IABZGlyAPMs9yz6LG8AdAAAoPAi7CFkZWlhaQBmoLUlAKC0JQABYW0DLQYtcgDyAMosbAA7gPwA/EDhIm5nbGUAoKcpgAdBQkRhY2RlZmxub3Byc3oAJy0qLTAtNC2bLZ0toS2/LcMtxy3TLdgt3C3gLfwtcgDyABADYQByAHag6CoAoOkqYQBzAOgA/gIAAW5yOC08LechcnQAoJwpgANla25wcnN0AJkpSC1NLVQtXi1iLYItYQBwAHAA4QAaHG8AdABoAGkAbgDnAKEXgAFoaXIAoSmzJFotbwBwAPQAdCVooJUh7wD4JgABaXVmLWotZwBtAOEAuygAAWJwbi14LXMjZXRuZXEAceCKIgD+AODLKgD+cyNldG5lcQBx4IsiAP4A4MwqAP4AAWhyhi2KLWUAdADhABIraSNhbmdsZQAAAWxyki2WLeUhZnQAoLIiaSJnaHQAAKCzInkAMmThIXNoAKCiIoABZWxyAKcttC24LWKiKCKuLQAAAACyLWEAcgAAoLsicQAAoFoi7CFpcACg7iIAAWJ0vC1eD2EA8gBfD3IAAOA12DPddAByAOkAlS1zAHUAAAFicM0t0C0A4IIi0iAA4IMi0iBwAGYAAOA12GfdcgBvAPAAWQt0AHIA6QCaLQABY3XkLegtcgAA4DXYy9wAAWJw7C30LW4AAAFFZXUt8S0A4IoiAP5uAAABRWV/LfktAOCLIgD+6SJnemFnAKCaKYADY2Vmb3BycwANLhAuJS4pLiMuLi40LukhcmN1YQABZGkULiEuAAFiZxguHC5hAHIAAKBfKmUAcaAnIgCgWSLlIXJwAKAYIXIAAOA12DTdcABmAADgNdho3WWgQCJhAHQA6ABqD2MAcgAA4DXYzNzjCuQRUC4AAFQuAABYLmIuAAAAAGMubS5wLnQuAAAAAIguki4AAJouJxIqEnQAcgDpAB0ScgAA4DXYNd0AAUFhWy5eLnIA8gDnAnIA8gCTB75jAAFBYWYuaS5yAPIA4AJyAPIAjAdhAPAAeh5pAHMAAKD7IoABZHB0APgReS6DLgABZmx9LoAuAOA12GnddQDzAP8RaQBtAOUABBIAAUFhiy6OLnIA8gDuAnIA8gCaBwABY3GVLgoScgAA4DXYzdwAAXB0nS6hLmwAdQDzACUScgDpACASAARhY2VmaW9zdbEuvC7ELsguzC7PLtQu2S5jAAABdXm2LrsudABlADuA/QD9QE9kAAFpecAuwy5yAGMAd2FLZG4AO4ClAKVAcgAA4DXYNt1jAHkAV2RwAGYAAOA12GrdYwByAADgNdjO3AABY23dLt8ueQBOZGwAO4D/AP9AAAVhY2RlZmhpb3N38y73Lv8uAi8MLxAvEy8YLx0vIi9jInV0ZQB6YQABYXn7Lv4u8iFvbn5hN2RvAHQAfGEAAWV0Bi8KL3QAcgDmAB8QYQC2Y3IAAOA12DfdYwB5ADZk5yJyYXJyAKDdIXAAZgAA4DXYa91jAHIAAOA12M/cAAFqbiYvKC8AoA0gagAAoAwg");

// ../../node_modules/.pnpm/entities@8.0.0/node_modules/entities/dist/internal/bin-trie-flags.js
var BinTrieFlags;
(function(BinTrieFlags2) {
  BinTrieFlags2[BinTrieFlags2.VALUE_LENGTH = 49152] = "VALUE_LENGTH", BinTrieFlags2[BinTrieFlags2.FLAG13 = 8192] = "FLAG13", BinTrieFlags2[BinTrieFlags2.BRANCH_LENGTH = 8064] = "BRANCH_LENGTH", BinTrieFlags2[BinTrieFlags2.JUMP_TABLE = 127] = "JUMP_TABLE";
})(BinTrieFlags || (BinTrieFlags = {}));

// ../../node_modules/.pnpm/entities@8.0.0/node_modules/entities/dist/decode.js
var CharCodes;
(function(CharCodes2) {
  CharCodes2[CharCodes2.NUM = 35] = "NUM", CharCodes2[CharCodes2.SEMI = 59] = "SEMI", CharCodes2[CharCodes2.EQUALS = 61] = "EQUALS", CharCodes2[CharCodes2.ZERO = 48] = "ZERO", CharCodes2[CharCodes2.NINE = 57] = "NINE", CharCodes2[CharCodes2.LOWER_A = 97] = "LOWER_A", CharCodes2[CharCodes2.LOWER_F = 102] = "LOWER_F", CharCodes2[CharCodes2.LOWER_X = 120] = "LOWER_X", CharCodes2[CharCodes2.LOWER_Z = 122] = "LOWER_Z", CharCodes2[CharCodes2.UPPER_A = 65] = "UPPER_A", CharCodes2[CharCodes2.UPPER_F = 70] = "UPPER_F", CharCodes2[CharCodes2.UPPER_Z = 90] = "UPPER_Z";
})(CharCodes || (CharCodes = {}));
var TO_LOWER_BIT = 32;
function isNumber(code) {
  return code >= CharCodes.ZERO && code <= CharCodes.NINE;
}
function isHexadecimalCharacter(code) {
  return code >= CharCodes.UPPER_A && code <= CharCodes.UPPER_F || code >= CharCodes.LOWER_A && code <= CharCodes.LOWER_F;
}
function isAsciiAlphaNumeric(code) {
  return code >= CharCodes.UPPER_A && code <= CharCodes.UPPER_Z || code >= CharCodes.LOWER_A && code <= CharCodes.LOWER_Z || isNumber(code);
}
function isEntityInAttributeInvalidEnd(code) {
  return code === CharCodes.EQUALS || isAsciiAlphaNumeric(code);
}
var EntityDecoderState;
(function(EntityDecoderState2) {
  EntityDecoderState2[EntityDecoderState2.EntityStart = 0] = "EntityStart", EntityDecoderState2[EntityDecoderState2.NumericStart = 1] = "NumericStart", EntityDecoderState2[EntityDecoderState2.NumericDecimal = 2] = "NumericDecimal", EntityDecoderState2[EntityDecoderState2.NumericHex = 3] = "NumericHex", EntityDecoderState2[EntityDecoderState2.NamedEntity = 4] = "NamedEntity";
})(EntityDecoderState || (EntityDecoderState = {}));
var DecodingMode;
(function(DecodingMode2) {
  DecodingMode2[DecodingMode2.Legacy = 0] = "Legacy", DecodingMode2[DecodingMode2.Strict = 1] = "Strict", DecodingMode2[DecodingMode2.Attribute = 2] = "Attribute";
})(DecodingMode || (DecodingMode = {}));
var EntityDecoder = class {
  decodeTree;
  emitCodePoint;
  errors;
  constructor(decodeTree, emitCodePoint, errors) {
    this.decodeTree = decodeTree, this.emitCodePoint = emitCodePoint, this.errors = errors;
  }
  /** The current state of the decoder. */
  state = EntityDecoderState.EntityStart;
  /** Characters that were consumed while parsing an entity. */
  consumed = 1;
  /**
   * The result of the entity.
   *
   * Either the result index of a numeric entity, or the codepoint of a
   * numeric entity.
   */
  result = 0;
  /** The current index in the decode tree. */
  treeIndex = 0;
  /** The number of characters that were consumed in excess. */
  excess = 1;
  /** The mode in which the decoder is operating. */
  decodeMode = DecodingMode.Strict;
  /** The number of characters that have been consumed in the current run. */
  runConsumed = 0;
  /**
   * Resets the instance to make it reusable.
   * @param decodeMode Entity decoding mode to use.
   */
  startEntity(decodeMode) {
    this.decodeMode = decodeMode, this.state = EntityDecoderState.EntityStart, this.result = 0, this.treeIndex = 0, this.excess = 1, this.consumed = 1, this.runConsumed = 0;
  }
  /**
   * Write an entity to the decoder. This can be called multiple times with partial entities.
   * If the entity is incomplete, the decoder will return -1.
   *
   * Mirrors the implementation of `getDecoder`, but with the ability to stop decoding if the
   * entity is incomplete, and resume when the next string is written.
   * @param input The string containing the entity (or a continuation of the entity).
   * @param offset The offset at which the entity begins. Should be 0 if this is not the first call.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  write(input, offset) {
    switch (this.state) {
      case EntityDecoderState.EntityStart:
        return input.charCodeAt(offset) === CharCodes.NUM ? (this.state = EntityDecoderState.NumericStart, this.consumed += 1, this.stateNumericStart(input, offset + 1)) : (this.state = EntityDecoderState.NamedEntity, this.stateNamedEntity(input, offset));
      case EntityDecoderState.NumericStart:
        return this.stateNumericStart(input, offset);
      case EntityDecoderState.NumericDecimal:
        return this.stateNumericDecimal(input, offset);
      case EntityDecoderState.NumericHex:
        return this.stateNumericHex(input, offset);
      case EntityDecoderState.NamedEntity:
        return this.stateNamedEntity(input, offset);
    }
  }
  /**
   * Switches between the numeric decimal and hexadecimal states.
   *
   * Equivalent to the `Numeric character reference state` in the HTML spec.
   * @param input The string containing the entity (or a continuation of the entity).
   * @param offset The current offset.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  stateNumericStart(input, offset) {
    return offset >= input.length ? -1 : (input.charCodeAt(offset) | TO_LOWER_BIT) === CharCodes.LOWER_X ? (this.state = EntityDecoderState.NumericHex, this.consumed += 1, this.stateNumericHex(input, offset + 1)) : (this.state = EntityDecoderState.NumericDecimal, this.stateNumericDecimal(input, offset));
  }
  /**
   * Parses a hexadecimal numeric entity.
   *
   * Equivalent to the `Hexademical character reference state` in the HTML spec.
   * @param input The string containing the entity (or a continuation of the entity).
   * @param offset The current offset.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  stateNumericHex(input, offset) {
    for (; offset < input.length; ) {
      let char = input.charCodeAt(offset);
      if (isNumber(char) || isHexadecimalCharacter(char)) {
        let digit = char <= CharCodes.NINE ? char - CharCodes.ZERO : (char | TO_LOWER_BIT) - CharCodes.LOWER_A + 10;
        this.result = this.result * 16 + digit, this.consumed++, offset++;
      } else
        return this.emitNumericEntity(char, 3);
    }
    return -1;
  }
  /**
   * Parses a decimal numeric entity.
   *
   * Equivalent to the `Decimal character reference state` in the HTML spec.
   * @param input The string containing the entity (or a continuation of the entity).
   * @param offset The current offset.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  stateNumericDecimal(input, offset) {
    for (; offset < input.length; ) {
      let char = input.charCodeAt(offset);
      if (isNumber(char))
        this.result = this.result * 10 + (char - CharCodes.ZERO), this.consumed++, offset++;
      else
        return this.emitNumericEntity(char, 2);
    }
    return -1;
  }
  /**
   * Validate and emit a numeric entity.
   *
   * Implements the logic from the `Hexademical character reference start
   * state` and `Numeric character reference end state` in the HTML spec.
   * @param lastCp The last code point of the entity. Used to see if the
   *               entity was terminated with a semicolon.
   * @param expectedLength The minimum number of characters that should be
   *                       consumed. Used to validate that at least one digit
   *                       was consumed.
   * @returns The number of characters that were consumed.
   */
  emitNumericEntity(lastCp, expectedLength) {
    if (this.consumed <= expectedLength)
      return this.errors?.absenceOfDigitsInNumericCharacterReference(this.consumed), 0;
    if (lastCp === CharCodes.SEMI)
      this.consumed += 1;
    else if (this.decodeMode === DecodingMode.Strict)
      return 0;
    return this.emitCodePoint(replaceCodePoint(this.result), this.consumed), this.errors && (lastCp !== CharCodes.SEMI && this.errors.missingSemicolonAfterCharacterReference(), this.errors.validateNumericCharacterReference(this.result)), this.consumed;
  }
  /**
   * Parses a named entity.
   *
   * Equivalent to the `Named character reference state` in the HTML spec.
   * @param input The string containing the entity (or a continuation of the entity).
   * @param offset The current offset.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  stateNamedEntity(input, offset) {
    let { decodeTree } = this, current = decodeTree[this.treeIndex], valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
    for (; offset < input.length; ) {
      if (valueLength === 0 && (current & BinTrieFlags.FLAG13) !== 0) {
        let runLength = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
        if (this.runConsumed === 0) {
          let firstChar = current & BinTrieFlags.JUMP_TABLE;
          if (input.charCodeAt(offset) !== firstChar)
            return this.result === 0 ? 0 : this.emitNotTerminatedNamedEntity();
          offset++, this.excess++, this.runConsumed++;
        }
        for (; this.runConsumed < runLength; ) {
          if (offset >= input.length)
            return -1;
          let charIndexInPacked = this.runConsumed - 1, packedWord = decodeTree[this.treeIndex + 1 + (charIndexInPacked >> 1)], expectedChar = charIndexInPacked % 2 === 0 ? packedWord & 255 : packedWord >> 8 & 255;
          if (input.charCodeAt(offset) !== expectedChar)
            return this.runConsumed = 0, this.result === 0 ? 0 : this.emitNotTerminatedNamedEntity();
          offset++, this.excess++, this.runConsumed++;
        }
        this.runConsumed = 0, this.treeIndex += 1 + (runLength >> 1), current = decodeTree[this.treeIndex], valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
      }
      if (offset >= input.length)
        break;
      let char = input.charCodeAt(offset);
      if (char === CharCodes.SEMI && valueLength !== 0 && (current & BinTrieFlags.FLAG13) !== 0)
        return this.emitNamedEntityData(this.treeIndex, valueLength, this.consumed + this.excess);
      if (this.treeIndex = determineBranch(decodeTree, current, this.treeIndex + Math.max(1, valueLength), char), this.treeIndex < 0)
        return this.result === 0 || // If we are parsing an attribute
        this.decodeMode === DecodingMode.Attribute && // We shouldn't have consumed any characters after the entity,
        (valueLength === 0 || // And there should be no invalid characters.
        isEntityInAttributeInvalidEnd(char)) ? 0 : this.emitNotTerminatedNamedEntity();
      if (current = decodeTree[this.treeIndex], valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14, valueLength !== 0) {
        if (char === CharCodes.SEMI)
          return this.emitNamedEntityData(this.treeIndex, valueLength, this.consumed + this.excess);
        this.decodeMode !== DecodingMode.Strict && (current & BinTrieFlags.FLAG13) === 0 && (this.result = this.treeIndex, this.consumed += this.excess, this.excess = 0);
      }
      offset++, this.excess++;
    }
    return -1;
  }
  /**
   * Emit a named entity that was not terminated with a semicolon.
   * @returns The number of characters consumed.
   */
  emitNotTerminatedNamedEntity() {
    let { result, decodeTree } = this, valueLength = (decodeTree[result] & BinTrieFlags.VALUE_LENGTH) >> 14;
    return this.emitNamedEntityData(result, valueLength, this.consumed), this.errors?.missingSemicolonAfterCharacterReference(), this.consumed;
  }
  /**
   * Emit a named entity.
   * @param result The index of the entity in the decode tree.
   * @param valueLength The number of bytes in the entity.
   * @param consumed The number of characters consumed.
   * @returns The number of characters consumed.
   */
  emitNamedEntityData(result, valueLength, consumed) {
    let { decodeTree } = this;
    return this.emitCodePoint(valueLength === 1 ? decodeTree[result] & ~(BinTrieFlags.VALUE_LENGTH | BinTrieFlags.FLAG13) : decodeTree[result + 1], consumed), valueLength === 3 && this.emitCodePoint(decodeTree[result + 2], consumed), consumed;
  }
  /**
   * Signal to the parser that the end of the input was reached.
   *
   * Remaining data will be emitted and relevant errors will be produced.
   * @returns The number of characters consumed.
   */
  end() {
    switch (this.state) {
      case EntityDecoderState.NamedEntity:
        return this.result !== 0 && (this.decodeMode !== DecodingMode.Attribute || this.result === this.treeIndex) ? this.emitNotTerminatedNamedEntity() : 0;
      // Otherwise, emit a numeric entity if we have one.
      case EntityDecoderState.NumericDecimal:
        return this.emitNumericEntity(0, 2);
      case EntityDecoderState.NumericHex:
        return this.emitNumericEntity(0, 3);
      case EntityDecoderState.NumericStart:
        return this.errors?.absenceOfDigitsInNumericCharacterReference(this.consumed), 0;
      case EntityDecoderState.EntityStart:
        return 0;
    }
  }
};
function determineBranch(decodeTree, current, nodeIndex, char) {
  let branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7, jumpOffset = current & BinTrieFlags.JUMP_TABLE;
  if (branchCount === 0)
    return jumpOffset !== 0 && char === jumpOffset ? nodeIndex : -1;
  if (jumpOffset) {
    let value = char - jumpOffset;
    return value < 0 || value >= branchCount ? -1 : decodeTree[nodeIndex + value] - 1;
  }
  let packedKeySlots = branchCount + 1 >> 1, lo = 0, hi = branchCount - 1;
  for (; lo <= hi; ) {
    let mid = lo + hi >>> 1, slot = mid >> 1, midKey = decodeTree[nodeIndex + slot] >> (mid & 1) * 8 & 255;
    if (midKey < char)
      lo = mid + 1;
    else if (midKey > char)
      hi = mid - 1;
    else
      return decodeTree[nodeIndex + packedKeySlots + mid];
  }
  return -1;
}

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/common/html.js
var html_exports = {};
__export(html_exports, {
  ATTRS: () => ATTRS,
  DOCUMENT_MODE: () => DOCUMENT_MODE,
  NS: () => NS,
  NUMBERED_HEADERS: () => NUMBERED_HEADERS,
  SPECIAL_ELEMENTS: () => SPECIAL_ELEMENTS,
  TAG_ID: () => TAG_ID,
  TAG_NAMES: () => TAG_NAMES,
  getTagID: () => getTagID,
  hasUnescapedText: () => hasUnescapedText
});
var NS;
(function(NS2) {
  NS2.HTML = "http://www.w3.org/1999/xhtml", NS2.MATHML = "http://www.w3.org/1998/Math/MathML", NS2.SVG = "http://www.w3.org/2000/svg", NS2.XLINK = "http://www.w3.org/1999/xlink", NS2.XML = "http://www.w3.org/XML/1998/namespace", NS2.XMLNS = "http://www.w3.org/2000/xmlns/";
})(NS || (NS = {}));
var ATTRS;
(function(ATTRS2) {
  ATTRS2.TYPE = "type", ATTRS2.ACTION = "action", ATTRS2.ENCODING = "encoding", ATTRS2.PROMPT = "prompt", ATTRS2.NAME = "name", ATTRS2.COLOR = "color", ATTRS2.FACE = "face", ATTRS2.SIZE = "size";
})(ATTRS || (ATTRS = {}));
var DOCUMENT_MODE;
(function(DOCUMENT_MODE2) {
  DOCUMENT_MODE2.NO_QUIRKS = "no-quirks", DOCUMENT_MODE2.QUIRKS = "quirks", DOCUMENT_MODE2.LIMITED_QUIRKS = "limited-quirks";
})(DOCUMENT_MODE || (DOCUMENT_MODE = {}));
var TAG_NAMES;
(function(TAG_NAMES2) {
  TAG_NAMES2.A = "a", TAG_NAMES2.ADDRESS = "address", TAG_NAMES2.ANNOTATION_XML = "annotation-xml", TAG_NAMES2.APPLET = "applet", TAG_NAMES2.AREA = "area", TAG_NAMES2.ARTICLE = "article", TAG_NAMES2.ASIDE = "aside", TAG_NAMES2.B = "b", TAG_NAMES2.BASE = "base", TAG_NAMES2.BASEFONT = "basefont", TAG_NAMES2.BGSOUND = "bgsound", TAG_NAMES2.BIG = "big", TAG_NAMES2.BLOCKQUOTE = "blockquote", TAG_NAMES2.BODY = "body", TAG_NAMES2.BR = "br", TAG_NAMES2.BUTTON = "button", TAG_NAMES2.CAPTION = "caption", TAG_NAMES2.CENTER = "center", TAG_NAMES2.CODE = "code", TAG_NAMES2.COL = "col", TAG_NAMES2.COLGROUP = "colgroup", TAG_NAMES2.DD = "dd", TAG_NAMES2.DESC = "desc", TAG_NAMES2.DETAILS = "details", TAG_NAMES2.DIALOG = "dialog", TAG_NAMES2.DIR = "dir", TAG_NAMES2.DIV = "div", TAG_NAMES2.DL = "dl", TAG_NAMES2.DT = "dt", TAG_NAMES2.EM = "em", TAG_NAMES2.EMBED = "embed", TAG_NAMES2.FIELDSET = "fieldset", TAG_NAMES2.FIGCAPTION = "figcaption", TAG_NAMES2.FIGURE = "figure", TAG_NAMES2.FONT = "font", TAG_NAMES2.FOOTER = "footer", TAG_NAMES2.FOREIGN_OBJECT = "foreignObject", TAG_NAMES2.FORM = "form", TAG_NAMES2.FRAME = "frame", TAG_NAMES2.FRAMESET = "frameset", TAG_NAMES2.H1 = "h1", TAG_NAMES2.H2 = "h2", TAG_NAMES2.H3 = "h3", TAG_NAMES2.H4 = "h4", TAG_NAMES2.H5 = "h5", TAG_NAMES2.H6 = "h6", TAG_NAMES2.HEAD = "head", TAG_NAMES2.HEADER = "header", TAG_NAMES2.HGROUP = "hgroup", TAG_NAMES2.HR = "hr", TAG_NAMES2.HTML = "html", TAG_NAMES2.I = "i", TAG_NAMES2.IMG = "img", TAG_NAMES2.IMAGE = "image", TAG_NAMES2.INPUT = "input", TAG_NAMES2.IFRAME = "iframe", TAG_NAMES2.KEYGEN = "keygen", TAG_NAMES2.LABEL = "label", TAG_NAMES2.LI = "li", TAG_NAMES2.LINK = "link", TAG_NAMES2.LISTING = "listing", TAG_NAMES2.MAIN = "main", TAG_NAMES2.MALIGNMARK = "malignmark", TAG_NAMES2.MARQUEE = "marquee", TAG_NAMES2.MATH = "math", TAG_NAMES2.MENU = "menu", TAG_NAMES2.META = "meta", TAG_NAMES2.MGLYPH = "mglyph", TAG_NAMES2.MI = "mi", TAG_NAMES2.MO = "mo", TAG_NAMES2.MN = "mn", TAG_NAMES2.MS = "ms", TAG_NAMES2.MTEXT = "mtext", TAG_NAMES2.NAV = "nav", TAG_NAMES2.NOBR = "nobr", TAG_NAMES2.NOFRAMES = "noframes", TAG_NAMES2.NOEMBED = "noembed", TAG_NAMES2.NOSCRIPT = "noscript", TAG_NAMES2.OBJECT = "object", TAG_NAMES2.OL = "ol", TAG_NAMES2.OPTGROUP = "optgroup", TAG_NAMES2.OPTION = "option", TAG_NAMES2.P = "p", TAG_NAMES2.PARAM = "param", TAG_NAMES2.PLAINTEXT = "plaintext", TAG_NAMES2.PRE = "pre", TAG_NAMES2.RB = "rb", TAG_NAMES2.RP = "rp", TAG_NAMES2.RT = "rt", TAG_NAMES2.RTC = "rtc", TAG_NAMES2.RUBY = "ruby", TAG_NAMES2.S = "s", TAG_NAMES2.SCRIPT = "script", TAG_NAMES2.SEARCH = "search", TAG_NAMES2.SECTION = "section", TAG_NAMES2.SELECT = "select", TAG_NAMES2.SOURCE = "source", TAG_NAMES2.SMALL = "small", TAG_NAMES2.SPAN = "span", TAG_NAMES2.STRIKE = "strike", TAG_NAMES2.STRONG = "strong", TAG_NAMES2.STYLE = "style", TAG_NAMES2.SUB = "sub", TAG_NAMES2.SUMMARY = "summary", TAG_NAMES2.SUP = "sup", TAG_NAMES2.TABLE = "table", TAG_NAMES2.TBODY = "tbody", TAG_NAMES2.TEMPLATE = "template", TAG_NAMES2.TEXTAREA = "textarea", TAG_NAMES2.TFOOT = "tfoot", TAG_NAMES2.TD = "td", TAG_NAMES2.TH = "th", TAG_NAMES2.THEAD = "thead", TAG_NAMES2.TITLE = "title", TAG_NAMES2.TR = "tr", TAG_NAMES2.TRACK = "track", TAG_NAMES2.TT = "tt", TAG_NAMES2.U = "u", TAG_NAMES2.UL = "ul", TAG_NAMES2.SVG = "svg", TAG_NAMES2.VAR = "var", TAG_NAMES2.WBR = "wbr", TAG_NAMES2.XMP = "xmp";
})(TAG_NAMES || (TAG_NAMES = {}));
var TAG_ID;
(function(TAG_ID2) {
  TAG_ID2[TAG_ID2.UNKNOWN = 0] = "UNKNOWN", TAG_ID2[TAG_ID2.A = 1] = "A", TAG_ID2[TAG_ID2.ADDRESS = 2] = "ADDRESS", TAG_ID2[TAG_ID2.ANNOTATION_XML = 3] = "ANNOTATION_XML", TAG_ID2[TAG_ID2.APPLET = 4] = "APPLET", TAG_ID2[TAG_ID2.AREA = 5] = "AREA", TAG_ID2[TAG_ID2.ARTICLE = 6] = "ARTICLE", TAG_ID2[TAG_ID2.ASIDE = 7] = "ASIDE", TAG_ID2[TAG_ID2.B = 8] = "B", TAG_ID2[TAG_ID2.BASE = 9] = "BASE", TAG_ID2[TAG_ID2.BASEFONT = 10] = "BASEFONT", TAG_ID2[TAG_ID2.BGSOUND = 11] = "BGSOUND", TAG_ID2[TAG_ID2.BIG = 12] = "BIG", TAG_ID2[TAG_ID2.BLOCKQUOTE = 13] = "BLOCKQUOTE", TAG_ID2[TAG_ID2.BODY = 14] = "BODY", TAG_ID2[TAG_ID2.BR = 15] = "BR", TAG_ID2[TAG_ID2.BUTTON = 16] = "BUTTON", TAG_ID2[TAG_ID2.CAPTION = 17] = "CAPTION", TAG_ID2[TAG_ID2.CENTER = 18] = "CENTER", TAG_ID2[TAG_ID2.CODE = 19] = "CODE", TAG_ID2[TAG_ID2.COL = 20] = "COL", TAG_ID2[TAG_ID2.COLGROUP = 21] = "COLGROUP", TAG_ID2[TAG_ID2.DD = 22] = "DD", TAG_ID2[TAG_ID2.DESC = 23] = "DESC", TAG_ID2[TAG_ID2.DETAILS = 24] = "DETAILS", TAG_ID2[TAG_ID2.DIALOG = 25] = "DIALOG", TAG_ID2[TAG_ID2.DIR = 26] = "DIR", TAG_ID2[TAG_ID2.DIV = 27] = "DIV", TAG_ID2[TAG_ID2.DL = 28] = "DL", TAG_ID2[TAG_ID2.DT = 29] = "DT", TAG_ID2[TAG_ID2.EM = 30] = "EM", TAG_ID2[TAG_ID2.EMBED = 31] = "EMBED", TAG_ID2[TAG_ID2.FIELDSET = 32] = "FIELDSET", TAG_ID2[TAG_ID2.FIGCAPTION = 33] = "FIGCAPTION", TAG_ID2[TAG_ID2.FIGURE = 34] = "FIGURE", TAG_ID2[TAG_ID2.FONT = 35] = "FONT", TAG_ID2[TAG_ID2.FOOTER = 36] = "FOOTER", TAG_ID2[TAG_ID2.FOREIGN_OBJECT = 37] = "FOREIGN_OBJECT", TAG_ID2[TAG_ID2.FORM = 38] = "FORM", TAG_ID2[TAG_ID2.FRAME = 39] = "FRAME", TAG_ID2[TAG_ID2.FRAMESET = 40] = "FRAMESET", TAG_ID2[TAG_ID2.H1 = 41] = "H1", TAG_ID2[TAG_ID2.H2 = 42] = "H2", TAG_ID2[TAG_ID2.H3 = 43] = "H3", TAG_ID2[TAG_ID2.H4 = 44] = "H4", TAG_ID2[TAG_ID2.H5 = 45] = "H5", TAG_ID2[TAG_ID2.H6 = 46] = "H6", TAG_ID2[TAG_ID2.HEAD = 47] = "HEAD", TAG_ID2[TAG_ID2.HEADER = 48] = "HEADER", TAG_ID2[TAG_ID2.HGROUP = 49] = "HGROUP", TAG_ID2[TAG_ID2.HR = 50] = "HR", TAG_ID2[TAG_ID2.HTML = 51] = "HTML", TAG_ID2[TAG_ID2.I = 52] = "I", TAG_ID2[TAG_ID2.IMG = 53] = "IMG", TAG_ID2[TAG_ID2.IMAGE = 54] = "IMAGE", TAG_ID2[TAG_ID2.INPUT = 55] = "INPUT", TAG_ID2[TAG_ID2.IFRAME = 56] = "IFRAME", TAG_ID2[TAG_ID2.KEYGEN = 57] = "KEYGEN", TAG_ID2[TAG_ID2.LABEL = 58] = "LABEL", TAG_ID2[TAG_ID2.LI = 59] = "LI", TAG_ID2[TAG_ID2.LINK = 60] = "LINK", TAG_ID2[TAG_ID2.LISTING = 61] = "LISTING", TAG_ID2[TAG_ID2.MAIN = 62] = "MAIN", TAG_ID2[TAG_ID2.MALIGNMARK = 63] = "MALIGNMARK", TAG_ID2[TAG_ID2.MARQUEE = 64] = "MARQUEE", TAG_ID2[TAG_ID2.MATH = 65] = "MATH", TAG_ID2[TAG_ID2.MENU = 66] = "MENU", TAG_ID2[TAG_ID2.META = 67] = "META", TAG_ID2[TAG_ID2.MGLYPH = 68] = "MGLYPH", TAG_ID2[TAG_ID2.MI = 69] = "MI", TAG_ID2[TAG_ID2.MO = 70] = "MO", TAG_ID2[TAG_ID2.MN = 71] = "MN", TAG_ID2[TAG_ID2.MS = 72] = "MS", TAG_ID2[TAG_ID2.MTEXT = 73] = "MTEXT", TAG_ID2[TAG_ID2.NAV = 74] = "NAV", TAG_ID2[TAG_ID2.NOBR = 75] = "NOBR", TAG_ID2[TAG_ID2.NOFRAMES = 76] = "NOFRAMES", TAG_ID2[TAG_ID2.NOEMBED = 77] = "NOEMBED", TAG_ID2[TAG_ID2.NOSCRIPT = 78] = "NOSCRIPT", TAG_ID2[TAG_ID2.OBJECT = 79] = "OBJECT", TAG_ID2[TAG_ID2.OL = 80] = "OL", TAG_ID2[TAG_ID2.OPTGROUP = 81] = "OPTGROUP", TAG_ID2[TAG_ID2.OPTION = 82] = "OPTION", TAG_ID2[TAG_ID2.P = 83] = "P", TAG_ID2[TAG_ID2.PARAM = 84] = "PARAM", TAG_ID2[TAG_ID2.PLAINTEXT = 85] = "PLAINTEXT", TAG_ID2[TAG_ID2.PRE = 86] = "PRE", TAG_ID2[TAG_ID2.RB = 87] = "RB", TAG_ID2[TAG_ID2.RP = 88] = "RP", TAG_ID2[TAG_ID2.RT = 89] = "RT", TAG_ID2[TAG_ID2.RTC = 90] = "RTC", TAG_ID2[TAG_ID2.RUBY = 91] = "RUBY", TAG_ID2[TAG_ID2.S = 92] = "S", TAG_ID2[TAG_ID2.SCRIPT = 93] = "SCRIPT", TAG_ID2[TAG_ID2.SEARCH = 94] = "SEARCH", TAG_ID2[TAG_ID2.SECTION = 95] = "SECTION", TAG_ID2[TAG_ID2.SELECT = 96] = "SELECT", TAG_ID2[TAG_ID2.SOURCE = 97] = "SOURCE", TAG_ID2[TAG_ID2.SMALL = 98] = "SMALL", TAG_ID2[TAG_ID2.SPAN = 99] = "SPAN", TAG_ID2[TAG_ID2.STRIKE = 100] = "STRIKE", TAG_ID2[TAG_ID2.STRONG = 101] = "STRONG", TAG_ID2[TAG_ID2.STYLE = 102] = "STYLE", TAG_ID2[TAG_ID2.SUB = 103] = "SUB", TAG_ID2[TAG_ID2.SUMMARY = 104] = "SUMMARY", TAG_ID2[TAG_ID2.SUP = 105] = "SUP", TAG_ID2[TAG_ID2.TABLE = 106] = "TABLE", TAG_ID2[TAG_ID2.TBODY = 107] = "TBODY", TAG_ID2[TAG_ID2.TEMPLATE = 108] = "TEMPLATE", TAG_ID2[TAG_ID2.TEXTAREA = 109] = "TEXTAREA", TAG_ID2[TAG_ID2.TFOOT = 110] = "TFOOT", TAG_ID2[TAG_ID2.TD = 111] = "TD", TAG_ID2[TAG_ID2.TH = 112] = "TH", TAG_ID2[TAG_ID2.THEAD = 113] = "THEAD", TAG_ID2[TAG_ID2.TITLE = 114] = "TITLE", TAG_ID2[TAG_ID2.TR = 115] = "TR", TAG_ID2[TAG_ID2.TRACK = 116] = "TRACK", TAG_ID2[TAG_ID2.TT = 117] = "TT", TAG_ID2[TAG_ID2.U = 118] = "U", TAG_ID2[TAG_ID2.UL = 119] = "UL", TAG_ID2[TAG_ID2.SVG = 120] = "SVG", TAG_ID2[TAG_ID2.VAR = 121] = "VAR", TAG_ID2[TAG_ID2.WBR = 122] = "WBR", TAG_ID2[TAG_ID2.XMP = 123] = "XMP";
})(TAG_ID || (TAG_ID = {}));
var TAG_NAME_TO_ID = /* @__PURE__ */ new Map([
  [TAG_NAMES.A, TAG_ID.A],
  [TAG_NAMES.ADDRESS, TAG_ID.ADDRESS],
  [TAG_NAMES.ANNOTATION_XML, TAG_ID.ANNOTATION_XML],
  [TAG_NAMES.APPLET, TAG_ID.APPLET],
  [TAG_NAMES.AREA, TAG_ID.AREA],
  [TAG_NAMES.ARTICLE, TAG_ID.ARTICLE],
  [TAG_NAMES.ASIDE, TAG_ID.ASIDE],
  [TAG_NAMES.B, TAG_ID.B],
  [TAG_NAMES.BASE, TAG_ID.BASE],
  [TAG_NAMES.BASEFONT, TAG_ID.BASEFONT],
  [TAG_NAMES.BGSOUND, TAG_ID.BGSOUND],
  [TAG_NAMES.BIG, TAG_ID.BIG],
  [TAG_NAMES.BLOCKQUOTE, TAG_ID.BLOCKQUOTE],
  [TAG_NAMES.BODY, TAG_ID.BODY],
  [TAG_NAMES.BR, TAG_ID.BR],
  [TAG_NAMES.BUTTON, TAG_ID.BUTTON],
  [TAG_NAMES.CAPTION, TAG_ID.CAPTION],
  [TAG_NAMES.CENTER, TAG_ID.CENTER],
  [TAG_NAMES.CODE, TAG_ID.CODE],
  [TAG_NAMES.COL, TAG_ID.COL],
  [TAG_NAMES.COLGROUP, TAG_ID.COLGROUP],
  [TAG_NAMES.DD, TAG_ID.DD],
  [TAG_NAMES.DESC, TAG_ID.DESC],
  [TAG_NAMES.DETAILS, TAG_ID.DETAILS],
  [TAG_NAMES.DIALOG, TAG_ID.DIALOG],
  [TAG_NAMES.DIR, TAG_ID.DIR],
  [TAG_NAMES.DIV, TAG_ID.DIV],
  [TAG_NAMES.DL, TAG_ID.DL],
  [TAG_NAMES.DT, TAG_ID.DT],
  [TAG_NAMES.EM, TAG_ID.EM],
  [TAG_NAMES.EMBED, TAG_ID.EMBED],
  [TAG_NAMES.FIELDSET, TAG_ID.FIELDSET],
  [TAG_NAMES.FIGCAPTION, TAG_ID.FIGCAPTION],
  [TAG_NAMES.FIGURE, TAG_ID.FIGURE],
  [TAG_NAMES.FONT, TAG_ID.FONT],
  [TAG_NAMES.FOOTER, TAG_ID.FOOTER],
  [TAG_NAMES.FOREIGN_OBJECT, TAG_ID.FOREIGN_OBJECT],
  [TAG_NAMES.FORM, TAG_ID.FORM],
  [TAG_NAMES.FRAME, TAG_ID.FRAME],
  [TAG_NAMES.FRAMESET, TAG_ID.FRAMESET],
  [TAG_NAMES.H1, TAG_ID.H1],
  [TAG_NAMES.H2, TAG_ID.H2],
  [TAG_NAMES.H3, TAG_ID.H3],
  [TAG_NAMES.H4, TAG_ID.H4],
  [TAG_NAMES.H5, TAG_ID.H5],
  [TAG_NAMES.H6, TAG_ID.H6],
  [TAG_NAMES.HEAD, TAG_ID.HEAD],
  [TAG_NAMES.HEADER, TAG_ID.HEADER],
  [TAG_NAMES.HGROUP, TAG_ID.HGROUP],
  [TAG_NAMES.HR, TAG_ID.HR],
  [TAG_NAMES.HTML, TAG_ID.HTML],
  [TAG_NAMES.I, TAG_ID.I],
  [TAG_NAMES.IMG, TAG_ID.IMG],
  [TAG_NAMES.IMAGE, TAG_ID.IMAGE],
  [TAG_NAMES.INPUT, TAG_ID.INPUT],
  [TAG_NAMES.IFRAME, TAG_ID.IFRAME],
  [TAG_NAMES.KEYGEN, TAG_ID.KEYGEN],
  [TAG_NAMES.LABEL, TAG_ID.LABEL],
  [TAG_NAMES.LI, TAG_ID.LI],
  [TAG_NAMES.LINK, TAG_ID.LINK],
  [TAG_NAMES.LISTING, TAG_ID.LISTING],
  [TAG_NAMES.MAIN, TAG_ID.MAIN],
  [TAG_NAMES.MALIGNMARK, TAG_ID.MALIGNMARK],
  [TAG_NAMES.MARQUEE, TAG_ID.MARQUEE],
  [TAG_NAMES.MATH, TAG_ID.MATH],
  [TAG_NAMES.MENU, TAG_ID.MENU],
  [TAG_NAMES.META, TAG_ID.META],
  [TAG_NAMES.MGLYPH, TAG_ID.MGLYPH],
  [TAG_NAMES.MI, TAG_ID.MI],
  [TAG_NAMES.MO, TAG_ID.MO],
  [TAG_NAMES.MN, TAG_ID.MN],
  [TAG_NAMES.MS, TAG_ID.MS],
  [TAG_NAMES.MTEXT, TAG_ID.MTEXT],
  [TAG_NAMES.NAV, TAG_ID.NAV],
  [TAG_NAMES.NOBR, TAG_ID.NOBR],
  [TAG_NAMES.NOFRAMES, TAG_ID.NOFRAMES],
  [TAG_NAMES.NOEMBED, TAG_ID.NOEMBED],
  [TAG_NAMES.NOSCRIPT, TAG_ID.NOSCRIPT],
  [TAG_NAMES.OBJECT, TAG_ID.OBJECT],
  [TAG_NAMES.OL, TAG_ID.OL],
  [TAG_NAMES.OPTGROUP, TAG_ID.OPTGROUP],
  [TAG_NAMES.OPTION, TAG_ID.OPTION],
  [TAG_NAMES.P, TAG_ID.P],
  [TAG_NAMES.PARAM, TAG_ID.PARAM],
  [TAG_NAMES.PLAINTEXT, TAG_ID.PLAINTEXT],
  [TAG_NAMES.PRE, TAG_ID.PRE],
  [TAG_NAMES.RB, TAG_ID.RB],
  [TAG_NAMES.RP, TAG_ID.RP],
  [TAG_NAMES.RT, TAG_ID.RT],
  [TAG_NAMES.RTC, TAG_ID.RTC],
  [TAG_NAMES.RUBY, TAG_ID.RUBY],
  [TAG_NAMES.S, TAG_ID.S],
  [TAG_NAMES.SCRIPT, TAG_ID.SCRIPT],
  [TAG_NAMES.SEARCH, TAG_ID.SEARCH],
  [TAG_NAMES.SECTION, TAG_ID.SECTION],
  [TAG_NAMES.SELECT, TAG_ID.SELECT],
  [TAG_NAMES.SOURCE, TAG_ID.SOURCE],
  [TAG_NAMES.SMALL, TAG_ID.SMALL],
  [TAG_NAMES.SPAN, TAG_ID.SPAN],
  [TAG_NAMES.STRIKE, TAG_ID.STRIKE],
  [TAG_NAMES.STRONG, TAG_ID.STRONG],
  [TAG_NAMES.STYLE, TAG_ID.STYLE],
  [TAG_NAMES.SUB, TAG_ID.SUB],
  [TAG_NAMES.SUMMARY, TAG_ID.SUMMARY],
  [TAG_NAMES.SUP, TAG_ID.SUP],
  [TAG_NAMES.TABLE, TAG_ID.TABLE],
  [TAG_NAMES.TBODY, TAG_ID.TBODY],
  [TAG_NAMES.TEMPLATE, TAG_ID.TEMPLATE],
  [TAG_NAMES.TEXTAREA, TAG_ID.TEXTAREA],
  [TAG_NAMES.TFOOT, TAG_ID.TFOOT],
  [TAG_NAMES.TD, TAG_ID.TD],
  [TAG_NAMES.TH, TAG_ID.TH],
  [TAG_NAMES.THEAD, TAG_ID.THEAD],
  [TAG_NAMES.TITLE, TAG_ID.TITLE],
  [TAG_NAMES.TR, TAG_ID.TR],
  [TAG_NAMES.TRACK, TAG_ID.TRACK],
  [TAG_NAMES.TT, TAG_ID.TT],
  [TAG_NAMES.U, TAG_ID.U],
  [TAG_NAMES.UL, TAG_ID.UL],
  [TAG_NAMES.SVG, TAG_ID.SVG],
  [TAG_NAMES.VAR, TAG_ID.VAR],
  [TAG_NAMES.WBR, TAG_ID.WBR],
  [TAG_NAMES.XMP, TAG_ID.XMP]
]);
function getTagID(tagName) {
  var _a;
  return (_a = TAG_NAME_TO_ID.get(tagName)) !== null && _a !== void 0 ? _a : TAG_ID.UNKNOWN;
}
var $ = TAG_ID, SPECIAL_ELEMENTS = {
  [NS.HTML]: /* @__PURE__ */ new Set([
    $.ADDRESS,
    $.APPLET,
    $.AREA,
    $.ARTICLE,
    $.ASIDE,
    $.BASE,
    $.BASEFONT,
    $.BGSOUND,
    $.BLOCKQUOTE,
    $.BODY,
    $.BR,
    $.BUTTON,
    $.CAPTION,
    $.CENTER,
    $.COL,
    $.COLGROUP,
    $.DD,
    $.DETAILS,
    $.DIR,
    $.DIV,
    $.DL,
    $.DT,
    $.EMBED,
    $.FIELDSET,
    $.FIGCAPTION,
    $.FIGURE,
    $.FOOTER,
    $.FORM,
    $.FRAME,
    $.FRAMESET,
    $.H1,
    $.H2,
    $.H3,
    $.H4,
    $.H5,
    $.H6,
    $.HEAD,
    $.HEADER,
    $.HGROUP,
    $.HR,
    $.HTML,
    $.IFRAME,
    $.IMG,
    $.INPUT,
    $.LI,
    $.LINK,
    $.LISTING,
    $.MAIN,
    $.MARQUEE,
    $.MENU,
    $.META,
    $.NAV,
    $.NOEMBED,
    $.NOFRAMES,
    $.NOSCRIPT,
    $.OBJECT,
    $.OL,
    $.P,
    $.PARAM,
    $.PLAINTEXT,
    $.PRE,
    $.SCRIPT,
    $.SECTION,
    $.SELECT,
    $.SOURCE,
    $.STYLE,
    $.SUMMARY,
    $.TABLE,
    $.TBODY,
    $.TD,
    $.TEMPLATE,
    $.TEXTAREA,
    $.TFOOT,
    $.TH,
    $.THEAD,
    $.TITLE,
    $.TR,
    $.TRACK,
    $.UL,
    $.WBR,
    $.XMP
  ]),
  [NS.MATHML]: /* @__PURE__ */ new Set([$.MI, $.MO, $.MN, $.MS, $.MTEXT, $.ANNOTATION_XML]),
  [NS.SVG]: /* @__PURE__ */ new Set([$.TITLE, $.FOREIGN_OBJECT, $.DESC]),
  [NS.XLINK]: /* @__PURE__ */ new Set(),
  [NS.XML]: /* @__PURE__ */ new Set(),
  [NS.XMLNS]: /* @__PURE__ */ new Set()
}, NUMBERED_HEADERS = /* @__PURE__ */ new Set([$.H1, $.H2, $.H3, $.H4, $.H5, $.H6]), UNESCAPED_TEXT = /* @__PURE__ */ new Set([
  TAG_NAMES.STYLE,
  TAG_NAMES.SCRIPT,
  TAG_NAMES.XMP,
  TAG_NAMES.IFRAME,
  TAG_NAMES.NOEMBED,
  TAG_NAMES.NOFRAMES,
  TAG_NAMES.PLAINTEXT
]);
function hasUnescapedText(tn, scriptingEnabled) {
  return UNESCAPED_TEXT.has(tn) || scriptingEnabled && tn === TAG_NAMES.NOSCRIPT;
}

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/tokenizer/index.js
var State;
(function(State3) {
  State3[State3.DATA = 0] = "DATA", State3[State3.RCDATA = 1] = "RCDATA", State3[State3.RAWTEXT = 2] = "RAWTEXT", State3[State3.SCRIPT_DATA = 3] = "SCRIPT_DATA", State3[State3.PLAINTEXT = 4] = "PLAINTEXT", State3[State3.TAG_OPEN = 5] = "TAG_OPEN", State3[State3.END_TAG_OPEN = 6] = "END_TAG_OPEN", State3[State3.TAG_NAME = 7] = "TAG_NAME", State3[State3.RCDATA_LESS_THAN_SIGN = 8] = "RCDATA_LESS_THAN_SIGN", State3[State3.RCDATA_END_TAG_OPEN = 9] = "RCDATA_END_TAG_OPEN", State3[State3.RCDATA_END_TAG_NAME = 10] = "RCDATA_END_TAG_NAME", State3[State3.RAWTEXT_LESS_THAN_SIGN = 11] = "RAWTEXT_LESS_THAN_SIGN", State3[State3.RAWTEXT_END_TAG_OPEN = 12] = "RAWTEXT_END_TAG_OPEN", State3[State3.RAWTEXT_END_TAG_NAME = 13] = "RAWTEXT_END_TAG_NAME", State3[State3.SCRIPT_DATA_LESS_THAN_SIGN = 14] = "SCRIPT_DATA_LESS_THAN_SIGN", State3[State3.SCRIPT_DATA_END_TAG_OPEN = 15] = "SCRIPT_DATA_END_TAG_OPEN", State3[State3.SCRIPT_DATA_END_TAG_NAME = 16] = "SCRIPT_DATA_END_TAG_NAME", State3[State3.SCRIPT_DATA_ESCAPE_START = 17] = "SCRIPT_DATA_ESCAPE_START", State3[State3.SCRIPT_DATA_ESCAPE_START_DASH = 18] = "SCRIPT_DATA_ESCAPE_START_DASH", State3[State3.SCRIPT_DATA_ESCAPED = 19] = "SCRIPT_DATA_ESCAPED", State3[State3.SCRIPT_DATA_ESCAPED_DASH = 20] = "SCRIPT_DATA_ESCAPED_DASH", State3[State3.SCRIPT_DATA_ESCAPED_DASH_DASH = 21] = "SCRIPT_DATA_ESCAPED_DASH_DASH", State3[State3.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN = 22] = "SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN", State3[State3.SCRIPT_DATA_ESCAPED_END_TAG_OPEN = 23] = "SCRIPT_DATA_ESCAPED_END_TAG_OPEN", State3[State3.SCRIPT_DATA_ESCAPED_END_TAG_NAME = 24] = "SCRIPT_DATA_ESCAPED_END_TAG_NAME", State3[State3.SCRIPT_DATA_DOUBLE_ESCAPE_START = 25] = "SCRIPT_DATA_DOUBLE_ESCAPE_START", State3[State3.SCRIPT_DATA_DOUBLE_ESCAPED = 26] = "SCRIPT_DATA_DOUBLE_ESCAPED", State3[State3.SCRIPT_DATA_DOUBLE_ESCAPED_DASH = 27] = "SCRIPT_DATA_DOUBLE_ESCAPED_DASH", State3[State3.SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH = 28] = "SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH", State3[State3.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN = 29] = "SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN", State3[State3.SCRIPT_DATA_DOUBLE_ESCAPE_END = 30] = "SCRIPT_DATA_DOUBLE_ESCAPE_END", State3[State3.BEFORE_ATTRIBUTE_NAME = 31] = "BEFORE_ATTRIBUTE_NAME", State3[State3.ATTRIBUTE_NAME = 32] = "ATTRIBUTE_NAME", State3[State3.AFTER_ATTRIBUTE_NAME = 33] = "AFTER_ATTRIBUTE_NAME", State3[State3.BEFORE_ATTRIBUTE_VALUE = 34] = "BEFORE_ATTRIBUTE_VALUE", State3[State3.ATTRIBUTE_VALUE_DOUBLE_QUOTED = 35] = "ATTRIBUTE_VALUE_DOUBLE_QUOTED", State3[State3.ATTRIBUTE_VALUE_SINGLE_QUOTED = 36] = "ATTRIBUTE_VALUE_SINGLE_QUOTED", State3[State3.ATTRIBUTE_VALUE_UNQUOTED = 37] = "ATTRIBUTE_VALUE_UNQUOTED", State3[State3.AFTER_ATTRIBUTE_VALUE_QUOTED = 38] = "AFTER_ATTRIBUTE_VALUE_QUOTED", State3[State3.SELF_CLOSING_START_TAG = 39] = "SELF_CLOSING_START_TAG", State3[State3.BOGUS_COMMENT = 40] = "BOGUS_COMMENT", State3[State3.MARKUP_DECLARATION_OPEN = 41] = "MARKUP_DECLARATION_OPEN", State3[State3.COMMENT_START = 42] = "COMMENT_START", State3[State3.COMMENT_START_DASH = 43] = "COMMENT_START_DASH", State3[State3.COMMENT = 44] = "COMMENT", State3[State3.COMMENT_LESS_THAN_SIGN = 45] = "COMMENT_LESS_THAN_SIGN", State3[State3.COMMENT_LESS_THAN_SIGN_BANG = 46] = "COMMENT_LESS_THAN_SIGN_BANG", State3[State3.COMMENT_LESS_THAN_SIGN_BANG_DASH = 47] = "COMMENT_LESS_THAN_SIGN_BANG_DASH", State3[State3.COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH = 48] = "COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH", State3[State3.COMMENT_END_DASH = 49] = "COMMENT_END_DASH", State3[State3.COMMENT_END = 50] = "COMMENT_END", State3[State3.COMMENT_END_BANG = 51] = "COMMENT_END_BANG", State3[State3.DOCTYPE = 52] = "DOCTYPE", State3[State3.BEFORE_DOCTYPE_NAME = 53] = "BEFORE_DOCTYPE_NAME", State3[State3.DOCTYPE_NAME = 54] = "DOCTYPE_NAME", State3[State3.AFTER_DOCTYPE_NAME = 55] = "AFTER_DOCTYPE_NAME", State3[State3.AFTER_DOCTYPE_PUBLIC_KEYWORD = 56] = "AFTER_DOCTYPE_PUBLIC_KEYWORD", State3[State3.BEFORE_DOCTYPE_PUBLIC_IDENTIFIER = 57] = "BEFORE_DOCTYPE_PUBLIC_IDENTIFIER", State3[State3.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED = 58] = "DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED", State3[State3.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED = 59] = "DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED", State3[State3.AFTER_DOCTYPE_PUBLIC_IDENTIFIER = 60] = "AFTER_DOCTYPE_PUBLIC_IDENTIFIER", State3[State3.BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS = 61] = "BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS", State3[State3.AFTER_DOCTYPE_SYSTEM_KEYWORD = 62] = "AFTER_DOCTYPE_SYSTEM_KEYWORD", State3[State3.BEFORE_DOCTYPE_SYSTEM_IDENTIFIER = 63] = "BEFORE_DOCTYPE_SYSTEM_IDENTIFIER", State3[State3.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED = 64] = "DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED", State3[State3.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED = 65] = "DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED", State3[State3.AFTER_DOCTYPE_SYSTEM_IDENTIFIER = 66] = "AFTER_DOCTYPE_SYSTEM_IDENTIFIER", State3[State3.BOGUS_DOCTYPE = 67] = "BOGUS_DOCTYPE", State3[State3.CDATA_SECTION = 68] = "CDATA_SECTION", State3[State3.CDATA_SECTION_BRACKET = 69] = "CDATA_SECTION_BRACKET", State3[State3.CDATA_SECTION_END = 70] = "CDATA_SECTION_END", State3[State3.CHARACTER_REFERENCE = 71] = "CHARACTER_REFERENCE", State3[State3.AMBIGUOUS_AMPERSAND = 72] = "AMBIGUOUS_AMPERSAND";
})(State || (State = {}));
var TokenizerMode = {
  DATA: State.DATA,
  RCDATA: State.RCDATA,
  RAWTEXT: State.RAWTEXT,
  SCRIPT_DATA: State.SCRIPT_DATA,
  PLAINTEXT: State.PLAINTEXT,
  CDATA_SECTION: State.CDATA_SECTION
};
function isAsciiDigit(cp) {
  return cp >= CODE_POINTS.DIGIT_0 && cp <= CODE_POINTS.DIGIT_9;
}
function isAsciiUpper(cp) {
  return cp >= CODE_POINTS.LATIN_CAPITAL_A && cp <= CODE_POINTS.LATIN_CAPITAL_Z;
}
function isAsciiLower(cp) {
  return cp >= CODE_POINTS.LATIN_SMALL_A && cp <= CODE_POINTS.LATIN_SMALL_Z;
}
function isAsciiLetter(cp) {
  return isAsciiLower(cp) || isAsciiUpper(cp);
}
function isAsciiAlphaNumeric2(cp) {
  return isAsciiLetter(cp) || isAsciiDigit(cp);
}
function toAsciiLower(cp) {
  return cp + 32;
}
function isWhitespace(cp) {
  return cp === CODE_POINTS.SPACE || cp === CODE_POINTS.LINE_FEED || cp === CODE_POINTS.TABULATION || cp === CODE_POINTS.FORM_FEED;
}
function isScriptDataDoubleEscapeSequenceEnd(cp) {
  return isWhitespace(cp) || cp === CODE_POINTS.SOLIDUS || cp === CODE_POINTS.GREATER_THAN_SIGN;
}
function getErrorForNumericCharacterReference(code) {
  return code === CODE_POINTS.NULL ? ERR.nullCharacterReference : code > 1114111 ? ERR.characterReferenceOutsideUnicodeRange : isSurrogate(code) ? ERR.surrogateCharacterReference : isUndefinedCodePoint(code) ? ERR.noncharacterCharacterReference : isControlCodePoint(code) || code === CODE_POINTS.CARRIAGE_RETURN ? ERR.controlCharacterReference : null;
}
var Tokenizer = class {
  constructor(options, handler) {
    this.options = options, this.handler = handler, this.paused = !1, this.inLoop = !1, this.inForeignNode = !1, this.lastStartTagName = "", this.active = !1, this.state = State.DATA, this.returnState = State.DATA, this.entityStartPos = 0, this.consumedAfterSnapshot = -1, this.currentCharacterToken = null, this.currentToken = null, this.currentAttr = { name: "", value: "" }, this.preprocessor = new Preprocessor(handler), this.currentLocation = this.getCurrentLocation(-1), this.entityDecoder = new EntityDecoder(htmlDecodeTree, (cp, consumed) => {
      this.preprocessor.pos = this.entityStartPos + consumed - 1, this._flushCodePointConsumedAsCharacterReference(cp);
    }, handler.onParseError ? {
      missingSemicolonAfterCharacterReference: () => {
        this._err(ERR.missingSemicolonAfterCharacterReference, 1);
      },
      absenceOfDigitsInNumericCharacterReference: (consumed) => {
        this._err(ERR.absenceOfDigitsInNumericCharacterReference, this.entityStartPos - this.preprocessor.pos + consumed);
      },
      validateNumericCharacterReference: (code) => {
        let error = getErrorForNumericCharacterReference(code);
        error && this._err(error, 1);
      }
    } : void 0);
  }
  //Errors
  _err(code, cpOffset = 0) {
    var _a, _b;
    (_b = (_a = this.handler).onParseError) === null || _b === void 0 || _b.call(_a, this.preprocessor.getError(code, cpOffset));
  }
  // NOTE: `offset` may never run across line boundaries.
  getCurrentLocation(offset) {
    return this.options.sourceCodeLocationInfo ? {
      startLine: this.preprocessor.line,
      startCol: this.preprocessor.col - offset,
      startOffset: this.preprocessor.offset - offset,
      endLine: -1,
      endCol: -1,
      endOffset: -1
    } : null;
  }
  _runParsingLoop() {
    if (!this.inLoop) {
      for (this.inLoop = !0; this.active && !this.paused; ) {
        this.consumedAfterSnapshot = 0;
        let cp = this._consume();
        this._ensureHibernation() || this._callState(cp);
      }
      this.inLoop = !1;
    }
  }
  //API
  pause() {
    this.paused = !0;
  }
  resume(writeCallback) {
    if (!this.paused)
      throw new Error("Parser was already resumed");
    this.paused = !1, !this.inLoop && (this._runParsingLoop(), this.paused || writeCallback?.());
  }
  write(chunk2, isLastChunk, writeCallback) {
    this.active = !0, this.preprocessor.write(chunk2, isLastChunk), this._runParsingLoop(), this.paused || writeCallback?.();
  }
  insertHtmlAtCurrentPos(chunk2) {
    this.active = !0, this.preprocessor.insertHtmlAtCurrentPos(chunk2), this._runParsingLoop();
  }
  //Hibernation
  _ensureHibernation() {
    return this.preprocessor.endOfChunkHit ? (this.preprocessor.retreat(this.consumedAfterSnapshot), this.consumedAfterSnapshot = 0, this.active = !1, !0) : !1;
  }
  //Consumption
  _consume() {
    return this.consumedAfterSnapshot++, this.preprocessor.advance();
  }
  _advanceBy(count) {
    this.consumedAfterSnapshot += count;
    for (let i = 0; i < count; i++)
      this.preprocessor.advance();
  }
  _consumeSequenceIfMatch(pattern, caseSensitive) {
    return this.preprocessor.startsWith(pattern, caseSensitive) ? (this._advanceBy(pattern.length - 1), !0) : !1;
  }
  //Token creation
  _createStartTagToken() {
    this.currentToken = {
      type: TokenType.START_TAG,
      tagName: "",
      tagID: TAG_ID.UNKNOWN,
      selfClosing: !1,
      ackSelfClosing: !1,
      attrs: [],
      location: this.getCurrentLocation(1)
    };
  }
  _createEndTagToken() {
    this.currentToken = {
      type: TokenType.END_TAG,
      tagName: "",
      tagID: TAG_ID.UNKNOWN,
      selfClosing: !1,
      ackSelfClosing: !1,
      attrs: [],
      location: this.getCurrentLocation(2)
    };
  }
  _createCommentToken(offset) {
    this.currentToken = {
      type: TokenType.COMMENT,
      data: "",
      location: this.getCurrentLocation(offset)
    };
  }
  _createDoctypeToken(initialName) {
    this.currentToken = {
      type: TokenType.DOCTYPE,
      name: initialName,
      forceQuirks: !1,
      publicId: null,
      systemId: null,
      location: this.currentLocation
    };
  }
  _createCharacterToken(type2, chars) {
    this.currentCharacterToken = {
      type: type2,
      chars,
      location: this.currentLocation
    };
  }
  //Tag attributes
  _createAttr(attrNameFirstCh) {
    this.currentAttr = {
      name: attrNameFirstCh,
      value: ""
    }, this.currentLocation = this.getCurrentLocation(0);
  }
  _leaveAttrName() {
    var _a, _b;
    let token = this.currentToken;
    if (getTokenAttr(token, this.currentAttr.name) === null) {
      if (token.attrs.push(this.currentAttr), token.location && this.currentLocation) {
        let attrLocations = (_a = (_b = token.location).attrs) !== null && _a !== void 0 ? _a : _b.attrs = /* @__PURE__ */ Object.create(null);
        attrLocations[this.currentAttr.name] = this.currentLocation, this._leaveAttrValue();
      }
    } else
      this._err(ERR.duplicateAttribute);
  }
  _leaveAttrValue() {
    this.currentLocation && (this.currentLocation.endLine = this.preprocessor.line, this.currentLocation.endCol = this.preprocessor.col, this.currentLocation.endOffset = this.preprocessor.offset);
  }
  //Token emission
  prepareToken(ct) {
    this._emitCurrentCharacterToken(ct.location), this.currentToken = null, ct.location && (ct.location.endLine = this.preprocessor.line, ct.location.endCol = this.preprocessor.col + 1, ct.location.endOffset = this.preprocessor.offset + 1), this.currentLocation = this.getCurrentLocation(-1);
  }
  emitCurrentTagToken() {
    let ct = this.currentToken;
    this.prepareToken(ct), ct.tagID = getTagID(ct.tagName), ct.type === TokenType.START_TAG ? (this.lastStartTagName = ct.tagName, this.handler.onStartTag(ct)) : (ct.attrs.length > 0 && this._err(ERR.endTagWithAttributes), ct.selfClosing && this._err(ERR.endTagWithTrailingSolidus), this.handler.onEndTag(ct)), this.preprocessor.dropParsedChunk();
  }
  emitCurrentComment(ct) {
    this.prepareToken(ct), this.handler.onComment(ct), this.preprocessor.dropParsedChunk();
  }
  emitCurrentDoctype(ct) {
    this.prepareToken(ct), this.handler.onDoctype(ct), this.preprocessor.dropParsedChunk();
  }
  _emitCurrentCharacterToken(nextLocation) {
    if (this.currentCharacterToken) {
      switch (nextLocation && this.currentCharacterToken.location && (this.currentCharacterToken.location.endLine = nextLocation.startLine, this.currentCharacterToken.location.endCol = nextLocation.startCol, this.currentCharacterToken.location.endOffset = nextLocation.startOffset), this.currentCharacterToken.type) {
        case TokenType.CHARACTER: {
          this.handler.onCharacter(this.currentCharacterToken);
          break;
        }
        case TokenType.NULL_CHARACTER: {
          this.handler.onNullCharacter(this.currentCharacterToken);
          break;
        }
        case TokenType.WHITESPACE_CHARACTER: {
          this.handler.onWhitespaceCharacter(this.currentCharacterToken);
          break;
        }
      }
      this.currentCharacterToken = null;
    }
  }
  _emitEOFToken() {
    let location = this.getCurrentLocation(0);
    location && (location.endLine = location.startLine, location.endCol = location.startCol, location.endOffset = location.startOffset), this._emitCurrentCharacterToken(location), this.handler.onEof({ type: TokenType.EOF, location }), this.active = !1;
  }
  //Characters emission
  //OPTIMIZATION: The specification uses only one type of character token (one token per character).
  //This causes a huge memory overhead and a lot of unnecessary parser loops. parse5 uses 3 groups of characters.
  //If we have a sequence of characters that belong to the same group, the parser can process it
  //as a single solid character token.
  //So, there are 3 types of character tokens in parse5:
  //1)TokenType.NULL_CHARACTER - \u0000-character sequences (e.g. '\u0000\u0000\u0000')
  //2)TokenType.WHITESPACE_CHARACTER - any whitespace/new-line character sequences (e.g. '\n  \r\t   \f')
  //3)TokenType.CHARACTER - any character sequence which don't belong to groups 1 and 2 (e.g. 'abcdef1234@@#$%^')
  _appendCharToCurrentCharacterToken(type2, ch) {
    if (this.currentCharacterToken)
      if (this.currentCharacterToken.type === type2) {
        this.currentCharacterToken.chars += ch;
        return;
      } else
        this.currentLocation = this.getCurrentLocation(0), this._emitCurrentCharacterToken(this.currentLocation), this.preprocessor.dropParsedChunk();
    this._createCharacterToken(type2, ch);
  }
  _emitCodePoint(cp) {
    let type2 = isWhitespace(cp) ? TokenType.WHITESPACE_CHARACTER : cp === CODE_POINTS.NULL ? TokenType.NULL_CHARACTER : TokenType.CHARACTER;
    this._appendCharToCurrentCharacterToken(type2, cp < 65536 ? String.fromCharCode(cp) : String.fromCodePoint(cp));
  }
  //NOTE: used when we emit characters explicitly.
  //This is always for non-whitespace and non-null characters, which allows us to avoid additional checks.
  _emitChars(ch) {
    this._appendCharToCurrentCharacterToken(TokenType.CHARACTER, ch);
  }
  // Character reference helpers
  _startCharacterReference() {
    this.returnState = this.state, this.state = State.CHARACTER_REFERENCE, this.entityStartPos = this.preprocessor.pos, this.entityDecoder.startEntity(this._isCharacterReferenceInAttribute() ? DecodingMode.Attribute : DecodingMode.Legacy);
  }
  _isCharacterReferenceInAttribute() {
    return this.returnState === State.ATTRIBUTE_VALUE_DOUBLE_QUOTED || this.returnState === State.ATTRIBUTE_VALUE_SINGLE_QUOTED || this.returnState === State.ATTRIBUTE_VALUE_UNQUOTED;
  }
  _flushCodePointConsumedAsCharacterReference(cp) {
    this._isCharacterReferenceInAttribute() ? this.currentAttr.value += String.fromCodePoint(cp) : this._emitCodePoint(cp);
  }
  // Calling states this way turns out to be much faster than any other approach.
  _callState(cp) {
    switch (this.state) {
      case State.DATA: {
        this._stateData(cp);
        break;
      }
      case State.RCDATA: {
        this._stateRcdata(cp);
        break;
      }
      case State.RAWTEXT: {
        this._stateRawtext(cp);
        break;
      }
      case State.SCRIPT_DATA: {
        this._stateScriptData(cp);
        break;
      }
      case State.PLAINTEXT: {
        this._statePlaintext(cp);
        break;
      }
      case State.TAG_OPEN: {
        this._stateTagOpen(cp);
        break;
      }
      case State.END_TAG_OPEN: {
        this._stateEndTagOpen(cp);
        break;
      }
      case State.TAG_NAME: {
        this._stateTagName(cp);
        break;
      }
      case State.RCDATA_LESS_THAN_SIGN: {
        this._stateRcdataLessThanSign(cp);
        break;
      }
      case State.RCDATA_END_TAG_OPEN: {
        this._stateRcdataEndTagOpen(cp);
        break;
      }
      case State.RCDATA_END_TAG_NAME: {
        this._stateRcdataEndTagName(cp);
        break;
      }
      case State.RAWTEXT_LESS_THAN_SIGN: {
        this._stateRawtextLessThanSign(cp);
        break;
      }
      case State.RAWTEXT_END_TAG_OPEN: {
        this._stateRawtextEndTagOpen(cp);
        break;
      }
      case State.RAWTEXT_END_TAG_NAME: {
        this._stateRawtextEndTagName(cp);
        break;
      }
      case State.SCRIPT_DATA_LESS_THAN_SIGN: {
        this._stateScriptDataLessThanSign(cp);
        break;
      }
      case State.SCRIPT_DATA_END_TAG_OPEN: {
        this._stateScriptDataEndTagOpen(cp);
        break;
      }
      case State.SCRIPT_DATA_END_TAG_NAME: {
        this._stateScriptDataEndTagName(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPE_START: {
        this._stateScriptDataEscapeStart(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPE_START_DASH: {
        this._stateScriptDataEscapeStartDash(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED: {
        this._stateScriptDataEscaped(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_DASH: {
        this._stateScriptDataEscapedDash(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_DASH_DASH: {
        this._stateScriptDataEscapedDashDash(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN: {
        this._stateScriptDataEscapedLessThanSign(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_END_TAG_OPEN: {
        this._stateScriptDataEscapedEndTagOpen(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_END_TAG_NAME: {
        this._stateScriptDataEscapedEndTagName(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPE_START: {
        this._stateScriptDataDoubleEscapeStart(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPED: {
        this._stateScriptDataDoubleEscaped(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH: {
        this._stateScriptDataDoubleEscapedDash(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH: {
        this._stateScriptDataDoubleEscapedDashDash(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN: {
        this._stateScriptDataDoubleEscapedLessThanSign(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPE_END: {
        this._stateScriptDataDoubleEscapeEnd(cp);
        break;
      }
      case State.BEFORE_ATTRIBUTE_NAME: {
        this._stateBeforeAttributeName(cp);
        break;
      }
      case State.ATTRIBUTE_NAME: {
        this._stateAttributeName(cp);
        break;
      }
      case State.AFTER_ATTRIBUTE_NAME: {
        this._stateAfterAttributeName(cp);
        break;
      }
      case State.BEFORE_ATTRIBUTE_VALUE: {
        this._stateBeforeAttributeValue(cp);
        break;
      }
      case State.ATTRIBUTE_VALUE_DOUBLE_QUOTED: {
        this._stateAttributeValueDoubleQuoted(cp);
        break;
      }
      case State.ATTRIBUTE_VALUE_SINGLE_QUOTED: {
        this._stateAttributeValueSingleQuoted(cp);
        break;
      }
      case State.ATTRIBUTE_VALUE_UNQUOTED: {
        this._stateAttributeValueUnquoted(cp);
        break;
      }
      case State.AFTER_ATTRIBUTE_VALUE_QUOTED: {
        this._stateAfterAttributeValueQuoted(cp);
        break;
      }
      case State.SELF_CLOSING_START_TAG: {
        this._stateSelfClosingStartTag(cp);
        break;
      }
      case State.BOGUS_COMMENT: {
        this._stateBogusComment(cp);
        break;
      }
      case State.MARKUP_DECLARATION_OPEN: {
        this._stateMarkupDeclarationOpen(cp);
        break;
      }
      case State.COMMENT_START: {
        this._stateCommentStart(cp);
        break;
      }
      case State.COMMENT_START_DASH: {
        this._stateCommentStartDash(cp);
        break;
      }
      case State.COMMENT: {
        this._stateComment(cp);
        break;
      }
      case State.COMMENT_LESS_THAN_SIGN: {
        this._stateCommentLessThanSign(cp);
        break;
      }
      case State.COMMENT_LESS_THAN_SIGN_BANG: {
        this._stateCommentLessThanSignBang(cp);
        break;
      }
      case State.COMMENT_LESS_THAN_SIGN_BANG_DASH: {
        this._stateCommentLessThanSignBangDash(cp);
        break;
      }
      case State.COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH: {
        this._stateCommentLessThanSignBangDashDash(cp);
        break;
      }
      case State.COMMENT_END_DASH: {
        this._stateCommentEndDash(cp);
        break;
      }
      case State.COMMENT_END: {
        this._stateCommentEnd(cp);
        break;
      }
      case State.COMMENT_END_BANG: {
        this._stateCommentEndBang(cp);
        break;
      }
      case State.DOCTYPE: {
        this._stateDoctype(cp);
        break;
      }
      case State.BEFORE_DOCTYPE_NAME: {
        this._stateBeforeDoctypeName(cp);
        break;
      }
      case State.DOCTYPE_NAME: {
        this._stateDoctypeName(cp);
        break;
      }
      case State.AFTER_DOCTYPE_NAME: {
        this._stateAfterDoctypeName(cp);
        break;
      }
      case State.AFTER_DOCTYPE_PUBLIC_KEYWORD: {
        this._stateAfterDoctypePublicKeyword(cp);
        break;
      }
      case State.BEFORE_DOCTYPE_PUBLIC_IDENTIFIER: {
        this._stateBeforeDoctypePublicIdentifier(cp);
        break;
      }
      case State.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED: {
        this._stateDoctypePublicIdentifierDoubleQuoted(cp);
        break;
      }
      case State.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED: {
        this._stateDoctypePublicIdentifierSingleQuoted(cp);
        break;
      }
      case State.AFTER_DOCTYPE_PUBLIC_IDENTIFIER: {
        this._stateAfterDoctypePublicIdentifier(cp);
        break;
      }
      case State.BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS: {
        this._stateBetweenDoctypePublicAndSystemIdentifiers(cp);
        break;
      }
      case State.AFTER_DOCTYPE_SYSTEM_KEYWORD: {
        this._stateAfterDoctypeSystemKeyword(cp);
        break;
      }
      case State.BEFORE_DOCTYPE_SYSTEM_IDENTIFIER: {
        this._stateBeforeDoctypeSystemIdentifier(cp);
        break;
      }
      case State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED: {
        this._stateDoctypeSystemIdentifierDoubleQuoted(cp);
        break;
      }
      case State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED: {
        this._stateDoctypeSystemIdentifierSingleQuoted(cp);
        break;
      }
      case State.AFTER_DOCTYPE_SYSTEM_IDENTIFIER: {
        this._stateAfterDoctypeSystemIdentifier(cp);
        break;
      }
      case State.BOGUS_DOCTYPE: {
        this._stateBogusDoctype(cp);
        break;
      }
      case State.CDATA_SECTION: {
        this._stateCdataSection(cp);
        break;
      }
      case State.CDATA_SECTION_BRACKET: {
        this._stateCdataSectionBracket(cp);
        break;
      }
      case State.CDATA_SECTION_END: {
        this._stateCdataSectionEnd(cp);
        break;
      }
      case State.CHARACTER_REFERENCE: {
        this._stateCharacterReference();
        break;
      }
      case State.AMBIGUOUS_AMPERSAND: {
        this._stateAmbiguousAmpersand(cp);
        break;
      }
      default:
        throw new Error("Unknown state");
    }
  }
  // State machine
  // Data state
  //------------------------------------------------------------------
  _stateData(cp) {
    switch (cp) {
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.TAG_OPEN;
        break;
      }
      case CODE_POINTS.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), this._emitCodePoint(cp);
        break;
      }
      case CODE_POINTS.EOF: {
        this._emitEOFToken();
        break;
      }
      default:
        this._emitCodePoint(cp);
    }
  }
  //  RCDATA state
  //------------------------------------------------------------------
  _stateRcdata(cp) {
    switch (cp) {
      case CODE_POINTS.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.RCDATA_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._emitEOFToken();
        break;
      }
      default:
        this._emitCodePoint(cp);
    }
  }
  // RAWTEXT state
  //------------------------------------------------------------------
  _stateRawtext(cp) {
    switch (cp) {
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.RAWTEXT_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._emitEOFToken();
        break;
      }
      default:
        this._emitCodePoint(cp);
    }
  }
  // Script data state
  //------------------------------------------------------------------
  _stateScriptData(cp) {
    switch (cp) {
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._emitEOFToken();
        break;
      }
      default:
        this._emitCodePoint(cp);
    }
  }
  // PLAINTEXT state
  //------------------------------------------------------------------
  _statePlaintext(cp) {
    switch (cp) {
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._emitEOFToken();
        break;
      }
      default:
        this._emitCodePoint(cp);
    }
  }
  // Tag open state
  //------------------------------------------------------------------
  _stateTagOpen(cp) {
    if (isAsciiLetter(cp))
      this._createStartTagToken(), this.state = State.TAG_NAME, this._stateTagName(cp);
    else
      switch (cp) {
        case CODE_POINTS.EXCLAMATION_MARK: {
          this.state = State.MARKUP_DECLARATION_OPEN;
          break;
        }
        case CODE_POINTS.SOLIDUS: {
          this.state = State.END_TAG_OPEN;
          break;
        }
        case CODE_POINTS.QUESTION_MARK: {
          this._err(ERR.unexpectedQuestionMarkInsteadOfTagName), this._createCommentToken(1), this.state = State.BOGUS_COMMENT, this._stateBogusComment(cp);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofBeforeTagName), this._emitChars("<"), this._emitEOFToken();
          break;
        }
        default:
          this._err(ERR.invalidFirstCharacterOfTagName), this._emitChars("<"), this.state = State.DATA, this._stateData(cp);
      }
  }
  // End tag open state
  //------------------------------------------------------------------
  _stateEndTagOpen(cp) {
    if (isAsciiLetter(cp))
      this._createEndTagToken(), this.state = State.TAG_NAME, this._stateTagName(cp);
    else
      switch (cp) {
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.missingEndTagName), this.state = State.DATA;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofBeforeTagName), this._emitChars("</"), this._emitEOFToken();
          break;
        }
        default:
          this._err(ERR.invalidFirstCharacterOfTagName), this._createCommentToken(2), this.state = State.BOGUS_COMMENT, this._stateBogusComment(cp);
      }
  }
  // Tag name state
  //------------------------------------------------------------------
  _stateTagName(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        break;
      }
      case CODE_POINTS.SOLIDUS: {
        this.state = State.SELF_CLOSING_START_TAG;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA, this.emitCurrentTagToken();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), token.tagName += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag), this._emitEOFToken();
        break;
      }
      default:
        token.tagName += String.fromCodePoint(isAsciiUpper(cp) ? toAsciiLower(cp) : cp);
    }
  }
  // RCDATA less-than sign state
  //------------------------------------------------------------------
  _stateRcdataLessThanSign(cp) {
    cp === CODE_POINTS.SOLIDUS ? this.state = State.RCDATA_END_TAG_OPEN : (this._emitChars("<"), this.state = State.RCDATA, this._stateRcdata(cp));
  }
  // RCDATA end tag open state
  //------------------------------------------------------------------
  _stateRcdataEndTagOpen(cp) {
    isAsciiLetter(cp) ? (this.state = State.RCDATA_END_TAG_NAME, this._stateRcdataEndTagName(cp)) : (this._emitChars("</"), this.state = State.RCDATA, this._stateRcdata(cp));
  }
  handleSpecialEndTag(_cp) {
    if (!this.preprocessor.startsWith(this.lastStartTagName, !1))
      return !this._ensureHibernation();
    this._createEndTagToken();
    let token = this.currentToken;
    switch (token.tagName = this.lastStartTagName, this.preprocessor.peek(this.lastStartTagName.length)) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED:
        return this._advanceBy(this.lastStartTagName.length), this.state = State.BEFORE_ATTRIBUTE_NAME, !1;
      case CODE_POINTS.SOLIDUS:
        return this._advanceBy(this.lastStartTagName.length), this.state = State.SELF_CLOSING_START_TAG, !1;
      case CODE_POINTS.GREATER_THAN_SIGN:
        return this._advanceBy(this.lastStartTagName.length), this.emitCurrentTagToken(), this.state = State.DATA, !1;
      default:
        return !this._ensureHibernation();
    }
  }
  // RCDATA end tag name state
  //------------------------------------------------------------------
  _stateRcdataEndTagName(cp) {
    this.handleSpecialEndTag(cp) && (this._emitChars("</"), this.state = State.RCDATA, this._stateRcdata(cp));
  }
  // RAWTEXT less-than sign state
  //------------------------------------------------------------------
  _stateRawtextLessThanSign(cp) {
    cp === CODE_POINTS.SOLIDUS ? this.state = State.RAWTEXT_END_TAG_OPEN : (this._emitChars("<"), this.state = State.RAWTEXT, this._stateRawtext(cp));
  }
  // RAWTEXT end tag open state
  //------------------------------------------------------------------
  _stateRawtextEndTagOpen(cp) {
    isAsciiLetter(cp) ? (this.state = State.RAWTEXT_END_TAG_NAME, this._stateRawtextEndTagName(cp)) : (this._emitChars("</"), this.state = State.RAWTEXT, this._stateRawtext(cp));
  }
  // RAWTEXT end tag name state
  //------------------------------------------------------------------
  _stateRawtextEndTagName(cp) {
    this.handleSpecialEndTag(cp) && (this._emitChars("</"), this.state = State.RAWTEXT, this._stateRawtext(cp));
  }
  // Script data less-than sign state
  //------------------------------------------------------------------
  _stateScriptDataLessThanSign(cp) {
    switch (cp) {
      case CODE_POINTS.SOLIDUS: {
        this.state = State.SCRIPT_DATA_END_TAG_OPEN;
        break;
      }
      case CODE_POINTS.EXCLAMATION_MARK: {
        this.state = State.SCRIPT_DATA_ESCAPE_START, this._emitChars("<!");
        break;
      }
      default:
        this._emitChars("<"), this.state = State.SCRIPT_DATA, this._stateScriptData(cp);
    }
  }
  // Script data end tag open state
  //------------------------------------------------------------------
  _stateScriptDataEndTagOpen(cp) {
    isAsciiLetter(cp) ? (this.state = State.SCRIPT_DATA_END_TAG_NAME, this._stateScriptDataEndTagName(cp)) : (this._emitChars("</"), this.state = State.SCRIPT_DATA, this._stateScriptData(cp));
  }
  // Script data end tag name state
  //------------------------------------------------------------------
  _stateScriptDataEndTagName(cp) {
    this.handleSpecialEndTag(cp) && (this._emitChars("</"), this.state = State.SCRIPT_DATA, this._stateScriptData(cp));
  }
  // Script data escape start state
  //------------------------------------------------------------------
  _stateScriptDataEscapeStart(cp) {
    cp === CODE_POINTS.HYPHEN_MINUS ? (this.state = State.SCRIPT_DATA_ESCAPE_START_DASH, this._emitChars("-")) : (this.state = State.SCRIPT_DATA, this._stateScriptData(cp));
  }
  // Script data escape start dash state
  //------------------------------------------------------------------
  _stateScriptDataEscapeStartDash(cp) {
    cp === CODE_POINTS.HYPHEN_MINUS ? (this.state = State.SCRIPT_DATA_ESCAPED_DASH_DASH, this._emitChars("-")) : (this.state = State.SCRIPT_DATA, this._stateScriptData(cp));
  }
  // Script data escaped state
  //------------------------------------------------------------------
  _stateScriptDataEscaped(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.SCRIPT_DATA_ESCAPED_DASH, this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText), this._emitEOFToken();
        break;
      }
      default:
        this._emitCodePoint(cp);
    }
  }
  // Script data escaped dash state
  //------------------------------------------------------------------
  _stateScriptDataEscapedDash(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.SCRIPT_DATA_ESCAPED_DASH_DASH, this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), this.state = State.SCRIPT_DATA_ESCAPED, this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText), this._emitEOFToken();
        break;
      }
      default:
        this.state = State.SCRIPT_DATA_ESCAPED, this._emitCodePoint(cp);
    }
  }
  // Script data escaped dash dash state
  //------------------------------------------------------------------
  _stateScriptDataEscapedDashDash(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.SCRIPT_DATA, this._emitChars(">");
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), this.state = State.SCRIPT_DATA_ESCAPED, this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText), this._emitEOFToken();
        break;
      }
      default:
        this.state = State.SCRIPT_DATA_ESCAPED, this._emitCodePoint(cp);
    }
  }
  // Script data escaped less-than sign state
  //------------------------------------------------------------------
  _stateScriptDataEscapedLessThanSign(cp) {
    cp === CODE_POINTS.SOLIDUS ? this.state = State.SCRIPT_DATA_ESCAPED_END_TAG_OPEN : isAsciiLetter(cp) ? (this._emitChars("<"), this.state = State.SCRIPT_DATA_DOUBLE_ESCAPE_START, this._stateScriptDataDoubleEscapeStart(cp)) : (this._emitChars("<"), this.state = State.SCRIPT_DATA_ESCAPED, this._stateScriptDataEscaped(cp));
  }
  // Script data escaped end tag open state
  //------------------------------------------------------------------
  _stateScriptDataEscapedEndTagOpen(cp) {
    isAsciiLetter(cp) ? (this.state = State.SCRIPT_DATA_ESCAPED_END_TAG_NAME, this._stateScriptDataEscapedEndTagName(cp)) : (this._emitChars("</"), this.state = State.SCRIPT_DATA_ESCAPED, this._stateScriptDataEscaped(cp));
  }
  // Script data escaped end tag name state
  //------------------------------------------------------------------
  _stateScriptDataEscapedEndTagName(cp) {
    this.handleSpecialEndTag(cp) && (this._emitChars("</"), this.state = State.SCRIPT_DATA_ESCAPED, this._stateScriptDataEscaped(cp));
  }
  // Script data double escape start state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscapeStart(cp) {
    if (this.preprocessor.startsWith(SEQUENCES.SCRIPT, !1) && isScriptDataDoubleEscapeSequenceEnd(this.preprocessor.peek(SEQUENCES.SCRIPT.length))) {
      this._emitCodePoint(cp);
      for (let i = 0; i < SEQUENCES.SCRIPT.length; i++)
        this._emitCodePoint(this._consume());
      this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
    } else this._ensureHibernation() || (this.state = State.SCRIPT_DATA_ESCAPED, this._stateScriptDataEscaped(cp));
  }
  // Script data double escaped state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscaped(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH, this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN, this._emitChars("<");
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText), this._emitEOFToken();
        break;
      }
      default:
        this._emitCodePoint(cp);
    }
  }
  // Script data double escaped dash state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscapedDash(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH, this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN, this._emitChars("<");
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED, this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText), this._emitEOFToken();
        break;
      }
      default:
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED, this._emitCodePoint(cp);
    }
  }
  // Script data double escaped dash dash state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscapedDashDash(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN, this._emitChars("<");
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.SCRIPT_DATA, this._emitChars(">");
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED, this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText), this._emitEOFToken();
        break;
      }
      default:
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED, this._emitCodePoint(cp);
    }
  }
  // Script data double escaped less-than sign state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscapedLessThanSign(cp) {
    cp === CODE_POINTS.SOLIDUS ? (this.state = State.SCRIPT_DATA_DOUBLE_ESCAPE_END, this._emitChars("/")) : (this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED, this._stateScriptDataDoubleEscaped(cp));
  }
  // Script data double escape end state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscapeEnd(cp) {
    if (this.preprocessor.startsWith(SEQUENCES.SCRIPT, !1) && isScriptDataDoubleEscapeSequenceEnd(this.preprocessor.peek(SEQUENCES.SCRIPT.length))) {
      this._emitCodePoint(cp);
      for (let i = 0; i < SEQUENCES.SCRIPT.length; i++)
        this._emitCodePoint(this._consume());
      this.state = State.SCRIPT_DATA_ESCAPED;
    } else this._ensureHibernation() || (this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED, this._stateScriptDataDoubleEscaped(cp));
  }
  // Before attribute name state
  //------------------------------------------------------------------
  _stateBeforeAttributeName(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED:
        break;
      case CODE_POINTS.SOLIDUS:
      case CODE_POINTS.GREATER_THAN_SIGN:
      case CODE_POINTS.EOF: {
        this.state = State.AFTER_ATTRIBUTE_NAME, this._stateAfterAttributeName(cp);
        break;
      }
      case CODE_POINTS.EQUALS_SIGN: {
        this._err(ERR.unexpectedEqualsSignBeforeAttributeName), this._createAttr("="), this.state = State.ATTRIBUTE_NAME;
        break;
      }
      default:
        this._createAttr(""), this.state = State.ATTRIBUTE_NAME, this._stateAttributeName(cp);
    }
  }
  // Attribute name state
  //------------------------------------------------------------------
  _stateAttributeName(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED:
      case CODE_POINTS.SOLIDUS:
      case CODE_POINTS.GREATER_THAN_SIGN:
      case CODE_POINTS.EOF: {
        this._leaveAttrName(), this.state = State.AFTER_ATTRIBUTE_NAME, this._stateAfterAttributeName(cp);
        break;
      }
      case CODE_POINTS.EQUALS_SIGN: {
        this._leaveAttrName(), this.state = State.BEFORE_ATTRIBUTE_VALUE;
        break;
      }
      case CODE_POINTS.QUOTATION_MARK:
      case CODE_POINTS.APOSTROPHE:
      case CODE_POINTS.LESS_THAN_SIGN: {
        this._err(ERR.unexpectedCharacterInAttributeName), this.currentAttr.name += String.fromCodePoint(cp);
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), this.currentAttr.name += REPLACEMENT_CHARACTER;
        break;
      }
      default:
        this.currentAttr.name += String.fromCodePoint(isAsciiUpper(cp) ? toAsciiLower(cp) : cp);
    }
  }
  // After attribute name state
  //------------------------------------------------------------------
  _stateAfterAttributeName(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED:
        break;
      case CODE_POINTS.SOLIDUS: {
        this.state = State.SELF_CLOSING_START_TAG;
        break;
      }
      case CODE_POINTS.EQUALS_SIGN: {
        this.state = State.BEFORE_ATTRIBUTE_VALUE;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA, this.emitCurrentTagToken();
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag), this._emitEOFToken();
        break;
      }
      default:
        this._createAttr(""), this.state = State.ATTRIBUTE_NAME, this._stateAttributeName(cp);
    }
  }
  // Before attribute value state
  //------------------------------------------------------------------
  _stateBeforeAttributeValue(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED:
        break;
      case CODE_POINTS.QUOTATION_MARK: {
        this.state = State.ATTRIBUTE_VALUE_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        this.state = State.ATTRIBUTE_VALUE_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.missingAttributeValue), this.state = State.DATA, this.emitCurrentTagToken();
        break;
      }
      default:
        this.state = State.ATTRIBUTE_VALUE_UNQUOTED, this._stateAttributeValueUnquoted(cp);
    }
  }
  // Attribute value (double-quoted) state
  //------------------------------------------------------------------
  _stateAttributeValueDoubleQuoted(cp) {
    switch (cp) {
      case CODE_POINTS.QUOTATION_MARK: {
        this.state = State.AFTER_ATTRIBUTE_VALUE_QUOTED;
        break;
      }
      case CODE_POINTS.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), this.currentAttr.value += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag), this._emitEOFToken();
        break;
      }
      default:
        this.currentAttr.value += String.fromCodePoint(cp);
    }
  }
  // Attribute value (single-quoted) state
  //------------------------------------------------------------------
  _stateAttributeValueSingleQuoted(cp) {
    switch (cp) {
      case CODE_POINTS.APOSTROPHE: {
        this.state = State.AFTER_ATTRIBUTE_VALUE_QUOTED;
        break;
      }
      case CODE_POINTS.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), this.currentAttr.value += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag), this._emitEOFToken();
        break;
      }
      default:
        this.currentAttr.value += String.fromCodePoint(cp);
    }
  }
  // Attribute value (unquoted) state
  //------------------------------------------------------------------
  _stateAttributeValueUnquoted(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this._leaveAttrValue(), this.state = State.BEFORE_ATTRIBUTE_NAME;
        break;
      }
      case CODE_POINTS.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._leaveAttrValue(), this.state = State.DATA, this.emitCurrentTagToken();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), this.currentAttr.value += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.QUOTATION_MARK:
      case CODE_POINTS.APOSTROPHE:
      case CODE_POINTS.LESS_THAN_SIGN:
      case CODE_POINTS.EQUALS_SIGN:
      case CODE_POINTS.GRAVE_ACCENT: {
        this._err(ERR.unexpectedCharacterInUnquotedAttributeValue), this.currentAttr.value += String.fromCodePoint(cp);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag), this._emitEOFToken();
        break;
      }
      default:
        this.currentAttr.value += String.fromCodePoint(cp);
    }
  }
  // After attribute value (quoted) state
  //------------------------------------------------------------------
  _stateAfterAttributeValueQuoted(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this._leaveAttrValue(), this.state = State.BEFORE_ATTRIBUTE_NAME;
        break;
      }
      case CODE_POINTS.SOLIDUS: {
        this._leaveAttrValue(), this.state = State.SELF_CLOSING_START_TAG;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._leaveAttrValue(), this.state = State.DATA, this.emitCurrentTagToken();
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag), this._emitEOFToken();
        break;
      }
      default:
        this._err(ERR.missingWhitespaceBetweenAttributes), this.state = State.BEFORE_ATTRIBUTE_NAME, this._stateBeforeAttributeName(cp);
    }
  }
  // Self-closing start tag state
  //------------------------------------------------------------------
  _stateSelfClosingStartTag(cp) {
    switch (cp) {
      case CODE_POINTS.GREATER_THAN_SIGN: {
        let token = this.currentToken;
        token.selfClosing = !0, this.state = State.DATA, this.emitCurrentTagToken();
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag), this._emitEOFToken();
        break;
      }
      default:
        this._err(ERR.unexpectedSolidusInTag), this.state = State.BEFORE_ATTRIBUTE_NAME, this._stateBeforeAttributeName(cp);
    }
  }
  // Bogus comment state
  //------------------------------------------------------------------
  _stateBogusComment(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA, this.emitCurrentComment(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this.emitCurrentComment(token), this._emitEOFToken();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), token.data += REPLACEMENT_CHARACTER;
        break;
      }
      default:
        token.data += String.fromCodePoint(cp);
    }
  }
  // Markup declaration open state
  //------------------------------------------------------------------
  _stateMarkupDeclarationOpen(cp) {
    this._consumeSequenceIfMatch(SEQUENCES.DASH_DASH, !0) ? (this._createCommentToken(SEQUENCES.DASH_DASH.length + 1), this.state = State.COMMENT_START) : this._consumeSequenceIfMatch(SEQUENCES.DOCTYPE, !1) ? (this.currentLocation = this.getCurrentLocation(SEQUENCES.DOCTYPE.length + 1), this.state = State.DOCTYPE) : this._consumeSequenceIfMatch(SEQUENCES.CDATA_START, !0) ? this.inForeignNode ? this.state = State.CDATA_SECTION : (this._err(ERR.cdataInHtmlContent), this._createCommentToken(SEQUENCES.CDATA_START.length + 1), this.currentToken.data = "[CDATA[", this.state = State.BOGUS_COMMENT) : this._ensureHibernation() || (this._err(ERR.incorrectlyOpenedComment), this._createCommentToken(2), this.state = State.BOGUS_COMMENT, this._stateBogusComment(cp));
  }
  // Comment start state
  //------------------------------------------------------------------
  _stateCommentStart(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.COMMENT_START_DASH;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptClosingOfEmptyComment), this.state = State.DATA;
        let token = this.currentToken;
        this.emitCurrentComment(token);
        break;
      }
      default:
        this.state = State.COMMENT, this._stateComment(cp);
    }
  }
  // Comment start dash state
  //------------------------------------------------------------------
  _stateCommentStartDash(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.COMMENT_END;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptClosingOfEmptyComment), this.state = State.DATA, this.emitCurrentComment(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInComment), this.emitCurrentComment(token), this._emitEOFToken();
        break;
      }
      default:
        token.data += "-", this.state = State.COMMENT, this._stateComment(cp);
    }
  }
  // Comment state
  //------------------------------------------------------------------
  _stateComment(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.COMMENT_END_DASH;
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        token.data += "<", this.state = State.COMMENT_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), token.data += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInComment), this.emitCurrentComment(token), this._emitEOFToken();
        break;
      }
      default:
        token.data += String.fromCodePoint(cp);
    }
  }
  // Comment less-than sign state
  //------------------------------------------------------------------
  _stateCommentLessThanSign(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.EXCLAMATION_MARK: {
        token.data += "!", this.state = State.COMMENT_LESS_THAN_SIGN_BANG;
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        token.data += "<";
        break;
      }
      default:
        this.state = State.COMMENT, this._stateComment(cp);
    }
  }
  // Comment less-than sign bang state
  //------------------------------------------------------------------
  _stateCommentLessThanSignBang(cp) {
    cp === CODE_POINTS.HYPHEN_MINUS ? this.state = State.COMMENT_LESS_THAN_SIGN_BANG_DASH : (this.state = State.COMMENT, this._stateComment(cp));
  }
  // Comment less-than sign bang dash state
  //------------------------------------------------------------------
  _stateCommentLessThanSignBangDash(cp) {
    cp === CODE_POINTS.HYPHEN_MINUS ? this.state = State.COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH : (this.state = State.COMMENT_END_DASH, this._stateCommentEndDash(cp));
  }
  // Comment less-than sign bang dash dash state
  //------------------------------------------------------------------
  _stateCommentLessThanSignBangDashDash(cp) {
    cp !== CODE_POINTS.GREATER_THAN_SIGN && cp !== CODE_POINTS.EOF && this._err(ERR.nestedComment), this.state = State.COMMENT_END, this._stateCommentEnd(cp);
  }
  // Comment end dash state
  //------------------------------------------------------------------
  _stateCommentEndDash(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.COMMENT_END;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInComment), this.emitCurrentComment(token), this._emitEOFToken();
        break;
      }
      default:
        token.data += "-", this.state = State.COMMENT, this._stateComment(cp);
    }
  }
  // Comment end state
  //------------------------------------------------------------------
  _stateCommentEnd(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA, this.emitCurrentComment(token);
        break;
      }
      case CODE_POINTS.EXCLAMATION_MARK: {
        this.state = State.COMMENT_END_BANG;
        break;
      }
      case CODE_POINTS.HYPHEN_MINUS: {
        token.data += "-";
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInComment), this.emitCurrentComment(token), this._emitEOFToken();
        break;
      }
      default:
        token.data += "--", this.state = State.COMMENT, this._stateComment(cp);
    }
  }
  // Comment end bang state
  //------------------------------------------------------------------
  _stateCommentEndBang(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        token.data += "--!", this.state = State.COMMENT_END_DASH;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.incorrectlyClosedComment), this.state = State.DATA, this.emitCurrentComment(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInComment), this.emitCurrentComment(token), this._emitEOFToken();
        break;
      }
      default:
        token.data += "--!", this.state = State.COMMENT, this._stateComment(cp);
    }
  }
  // DOCTYPE state
  //------------------------------------------------------------------
  _stateDoctype(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.BEFORE_DOCTYPE_NAME;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.BEFORE_DOCTYPE_NAME, this._stateBeforeDoctypeName(cp);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype), this._createDoctypeToken(null);
        let token = this.currentToken;
        token.forceQuirks = !0, this.emitCurrentDoctype(token), this._emitEOFToken();
        break;
      }
      default:
        this._err(ERR.missingWhitespaceBeforeDoctypeName), this.state = State.BEFORE_DOCTYPE_NAME, this._stateBeforeDoctypeName(cp);
    }
  }
  // Before DOCTYPE name state
  //------------------------------------------------------------------
  _stateBeforeDoctypeName(cp) {
    if (isAsciiUpper(cp))
      this._createDoctypeToken(String.fromCharCode(toAsciiLower(cp))), this.state = State.DOCTYPE_NAME;
    else
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED:
          break;
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter), this._createDoctypeToken(REPLACEMENT_CHARACTER), this.state = State.DOCTYPE_NAME;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.missingDoctypeName), this._createDoctypeToken(null);
          let token = this.currentToken;
          token.forceQuirks = !0, this.emitCurrentDoctype(token), this.state = State.DATA;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInDoctype), this._createDoctypeToken(null);
          let token = this.currentToken;
          token.forceQuirks = !0, this.emitCurrentDoctype(token), this._emitEOFToken();
          break;
        }
        default:
          this._createDoctypeToken(String.fromCodePoint(cp)), this.state = State.DOCTYPE_NAME;
      }
  }
  // DOCTYPE name state
  //------------------------------------------------------------------
  _stateDoctypeName(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.AFTER_DOCTYPE_NAME;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA, this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), token.name += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype), token.forceQuirks = !0, this.emitCurrentDoctype(token), this._emitEOFToken();
        break;
      }
      default:
        token.name += String.fromCodePoint(isAsciiUpper(cp) ? toAsciiLower(cp) : cp);
    }
  }
  // After DOCTYPE name state
  //------------------------------------------------------------------
  _stateAfterDoctypeName(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED:
        break;
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA, this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype), token.forceQuirks = !0, this.emitCurrentDoctype(token), this._emitEOFToken();
        break;
      }
      default:
        this._consumeSequenceIfMatch(SEQUENCES.PUBLIC, !1) ? this.state = State.AFTER_DOCTYPE_PUBLIC_KEYWORD : this._consumeSequenceIfMatch(SEQUENCES.SYSTEM, !1) ? this.state = State.AFTER_DOCTYPE_SYSTEM_KEYWORD : this._ensureHibernation() || (this._err(ERR.invalidCharacterSequenceAfterDoctypeName), token.forceQuirks = !0, this.state = State.BOGUS_DOCTYPE, this._stateBogusDoctype(cp));
    }
  }
  // After DOCTYPE public keyword state
  //------------------------------------------------------------------
  _stateAfterDoctypePublicKeyword(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.BEFORE_DOCTYPE_PUBLIC_IDENTIFIER;
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        this._err(ERR.missingWhitespaceAfterDoctypePublicKeyword), token.publicId = "", this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        this._err(ERR.missingWhitespaceAfterDoctypePublicKeyword), token.publicId = "", this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.missingDoctypePublicIdentifier), token.forceQuirks = !0, this.state = State.DATA, this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype), token.forceQuirks = !0, this.emitCurrentDoctype(token), this._emitEOFToken();
        break;
      }
      default:
        this._err(ERR.missingQuoteBeforeDoctypePublicIdentifier), token.forceQuirks = !0, this.state = State.BOGUS_DOCTYPE, this._stateBogusDoctype(cp);
    }
  }
  // Before DOCTYPE public identifier state
  //------------------------------------------------------------------
  _stateBeforeDoctypePublicIdentifier(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED:
        break;
      case CODE_POINTS.QUOTATION_MARK: {
        token.publicId = "", this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        token.publicId = "", this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.missingDoctypePublicIdentifier), token.forceQuirks = !0, this.state = State.DATA, this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype), token.forceQuirks = !0, this.emitCurrentDoctype(token), this._emitEOFToken();
        break;
      }
      default:
        this._err(ERR.missingQuoteBeforeDoctypePublicIdentifier), token.forceQuirks = !0, this.state = State.BOGUS_DOCTYPE, this._stateBogusDoctype(cp);
    }
  }
  // DOCTYPE public identifier (double-quoted) state
  //------------------------------------------------------------------
  _stateDoctypePublicIdentifierDoubleQuoted(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.QUOTATION_MARK: {
        this.state = State.AFTER_DOCTYPE_PUBLIC_IDENTIFIER;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), token.publicId += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptDoctypePublicIdentifier), token.forceQuirks = !0, this.emitCurrentDoctype(token), this.state = State.DATA;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype), token.forceQuirks = !0, this.emitCurrentDoctype(token), this._emitEOFToken();
        break;
      }
      default:
        token.publicId += String.fromCodePoint(cp);
    }
  }
  // DOCTYPE public identifier (single-quoted) state
  //------------------------------------------------------------------
  _stateDoctypePublicIdentifierSingleQuoted(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.APOSTROPHE: {
        this.state = State.AFTER_DOCTYPE_PUBLIC_IDENTIFIER;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), token.publicId += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptDoctypePublicIdentifier), token.forceQuirks = !0, this.emitCurrentDoctype(token), this.state = State.DATA;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype), token.forceQuirks = !0, this.emitCurrentDoctype(token), this._emitEOFToken();
        break;
      }
      default:
        token.publicId += String.fromCodePoint(cp);
    }
  }
  // After DOCTYPE public identifier state
  //------------------------------------------------------------------
  _stateAfterDoctypePublicIdentifier(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA, this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        this._err(ERR.missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers), token.systemId = "", this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        this._err(ERR.missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers), token.systemId = "", this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype), token.forceQuirks = !0, this.emitCurrentDoctype(token), this._emitEOFToken();
        break;
      }
      default:
        this._err(ERR.missingQuoteBeforeDoctypeSystemIdentifier), token.forceQuirks = !0, this.state = State.BOGUS_DOCTYPE, this._stateBogusDoctype(cp);
    }
  }
  // Between DOCTYPE public and system identifiers state
  //------------------------------------------------------------------
  _stateBetweenDoctypePublicAndSystemIdentifiers(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED:
        break;
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.emitCurrentDoctype(token), this.state = State.DATA;
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        token.systemId = "", this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        token.systemId = "", this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype), token.forceQuirks = !0, this.emitCurrentDoctype(token), this._emitEOFToken();
        break;
      }
      default:
        this._err(ERR.missingQuoteBeforeDoctypeSystemIdentifier), token.forceQuirks = !0, this.state = State.BOGUS_DOCTYPE, this._stateBogusDoctype(cp);
    }
  }
  // After DOCTYPE system keyword state
  //------------------------------------------------------------------
  _stateAfterDoctypeSystemKeyword(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.BEFORE_DOCTYPE_SYSTEM_IDENTIFIER;
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        this._err(ERR.missingWhitespaceAfterDoctypeSystemKeyword), token.systemId = "", this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        this._err(ERR.missingWhitespaceAfterDoctypeSystemKeyword), token.systemId = "", this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.missingDoctypeSystemIdentifier), token.forceQuirks = !0, this.state = State.DATA, this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype), token.forceQuirks = !0, this.emitCurrentDoctype(token), this._emitEOFToken();
        break;
      }
      default:
        this._err(ERR.missingQuoteBeforeDoctypeSystemIdentifier), token.forceQuirks = !0, this.state = State.BOGUS_DOCTYPE, this._stateBogusDoctype(cp);
    }
  }
  // Before DOCTYPE system identifier state
  //------------------------------------------------------------------
  _stateBeforeDoctypeSystemIdentifier(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED:
        break;
      case CODE_POINTS.QUOTATION_MARK: {
        token.systemId = "", this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        token.systemId = "", this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.missingDoctypeSystemIdentifier), token.forceQuirks = !0, this.state = State.DATA, this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype), token.forceQuirks = !0, this.emitCurrentDoctype(token), this._emitEOFToken();
        break;
      }
      default:
        this._err(ERR.missingQuoteBeforeDoctypeSystemIdentifier), token.forceQuirks = !0, this.state = State.BOGUS_DOCTYPE, this._stateBogusDoctype(cp);
    }
  }
  // DOCTYPE system identifier (double-quoted) state
  //------------------------------------------------------------------
  _stateDoctypeSystemIdentifierDoubleQuoted(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.QUOTATION_MARK: {
        this.state = State.AFTER_DOCTYPE_SYSTEM_IDENTIFIER;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), token.systemId += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptDoctypeSystemIdentifier), token.forceQuirks = !0, this.emitCurrentDoctype(token), this.state = State.DATA;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype), token.forceQuirks = !0, this.emitCurrentDoctype(token), this._emitEOFToken();
        break;
      }
      default:
        token.systemId += String.fromCodePoint(cp);
    }
  }
  // DOCTYPE system identifier (single-quoted) state
  //------------------------------------------------------------------
  _stateDoctypeSystemIdentifierSingleQuoted(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.APOSTROPHE: {
        this.state = State.AFTER_DOCTYPE_SYSTEM_IDENTIFIER;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter), token.systemId += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptDoctypeSystemIdentifier), token.forceQuirks = !0, this.emitCurrentDoctype(token), this.state = State.DATA;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype), token.forceQuirks = !0, this.emitCurrentDoctype(token), this._emitEOFToken();
        break;
      }
      default:
        token.systemId += String.fromCodePoint(cp);
    }
  }
  // After DOCTYPE system identifier state
  //------------------------------------------------------------------
  _stateAfterDoctypeSystemIdentifier(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED:
        break;
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.emitCurrentDoctype(token), this.state = State.DATA;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype), token.forceQuirks = !0, this.emitCurrentDoctype(token), this._emitEOFToken();
        break;
      }
      default:
        this._err(ERR.unexpectedCharacterAfterDoctypeSystemIdentifier), this.state = State.BOGUS_DOCTYPE, this._stateBogusDoctype(cp);
    }
  }
  // Bogus DOCTYPE state
  //------------------------------------------------------------------
  _stateBogusDoctype(cp) {
    let token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.emitCurrentDoctype(token), this.state = State.DATA;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        break;
      }
      case CODE_POINTS.EOF: {
        this.emitCurrentDoctype(token), this._emitEOFToken();
        break;
      }
      default:
    }
  }
  // CDATA section state
  //------------------------------------------------------------------
  _stateCdataSection(cp) {
    switch (cp) {
      case CODE_POINTS.RIGHT_SQUARE_BRACKET: {
        this.state = State.CDATA_SECTION_BRACKET;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInCdata), this._emitEOFToken();
        break;
      }
      default:
        this._emitCodePoint(cp);
    }
  }
  // CDATA section bracket state
  //------------------------------------------------------------------
  _stateCdataSectionBracket(cp) {
    cp === CODE_POINTS.RIGHT_SQUARE_BRACKET ? this.state = State.CDATA_SECTION_END : (this._emitChars("]"), this.state = State.CDATA_SECTION, this._stateCdataSection(cp));
  }
  // CDATA section end state
  //------------------------------------------------------------------
  _stateCdataSectionEnd(cp) {
    switch (cp) {
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        break;
      }
      case CODE_POINTS.RIGHT_SQUARE_BRACKET: {
        this._emitChars("]");
        break;
      }
      default:
        this._emitChars("]]"), this.state = State.CDATA_SECTION, this._stateCdataSection(cp);
    }
  }
  // Character reference state
  //------------------------------------------------------------------
  _stateCharacterReference() {
    let length = this.entityDecoder.write(this.preprocessor.html, this.preprocessor.pos);
    if (length < 0)
      if (this.preprocessor.lastChunkWritten)
        length = this.entityDecoder.end();
      else {
        this.active = !1, this.preprocessor.pos = this.preprocessor.html.length - 1, this.consumedAfterSnapshot = 0, this.preprocessor.endOfChunkHit = !0;
        return;
      }
    length === 0 ? (this.preprocessor.pos = this.entityStartPos, this._flushCodePointConsumedAsCharacterReference(CODE_POINTS.AMPERSAND), this.state = !this._isCharacterReferenceInAttribute() && isAsciiAlphaNumeric2(this.preprocessor.peek(1)) ? State.AMBIGUOUS_AMPERSAND : this.returnState) : this.state = this.returnState;
  }
  // Ambiguos ampersand state
  //------------------------------------------------------------------
  _stateAmbiguousAmpersand(cp) {
    isAsciiAlphaNumeric2(cp) ? this._flushCodePointConsumedAsCharacterReference(cp) : (cp === CODE_POINTS.SEMICOLON && this._err(ERR.unknownNamedCharacterReference), this.state = this.returnState, this._callState(cp));
  }
};

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/parser/open-element-stack.js
var IMPLICIT_END_TAG_REQUIRED = /* @__PURE__ */ new Set([TAG_ID.DD, TAG_ID.DT, TAG_ID.LI, TAG_ID.OPTGROUP, TAG_ID.OPTION, TAG_ID.P, TAG_ID.RB, TAG_ID.RP, TAG_ID.RT, TAG_ID.RTC]), IMPLICIT_END_TAG_REQUIRED_THOROUGHLY = /* @__PURE__ */ new Set([
  ...IMPLICIT_END_TAG_REQUIRED,
  TAG_ID.CAPTION,
  TAG_ID.COLGROUP,
  TAG_ID.TBODY,
  TAG_ID.TD,
  TAG_ID.TFOOT,
  TAG_ID.TH,
  TAG_ID.THEAD,
  TAG_ID.TR
]), SCOPING_ELEMENTS_HTML = /* @__PURE__ */ new Set([
  TAG_ID.APPLET,
  TAG_ID.CAPTION,
  TAG_ID.HTML,
  TAG_ID.MARQUEE,
  TAG_ID.OBJECT,
  TAG_ID.TABLE,
  TAG_ID.TD,
  TAG_ID.TEMPLATE,
  TAG_ID.TH
]), SCOPING_ELEMENTS_HTML_LIST = /* @__PURE__ */ new Set([...SCOPING_ELEMENTS_HTML, TAG_ID.OL, TAG_ID.UL]), SCOPING_ELEMENTS_HTML_BUTTON = /* @__PURE__ */ new Set([...SCOPING_ELEMENTS_HTML, TAG_ID.BUTTON]), SCOPING_ELEMENTS_MATHML = /* @__PURE__ */ new Set([TAG_ID.ANNOTATION_XML, TAG_ID.MI, TAG_ID.MN, TAG_ID.MO, TAG_ID.MS, TAG_ID.MTEXT]), SCOPING_ELEMENTS_SVG = /* @__PURE__ */ new Set([TAG_ID.DESC, TAG_ID.FOREIGN_OBJECT, TAG_ID.TITLE]), TABLE_ROW_CONTEXT = /* @__PURE__ */ new Set([TAG_ID.TR, TAG_ID.TEMPLATE, TAG_ID.HTML]), TABLE_BODY_CONTEXT = /* @__PURE__ */ new Set([TAG_ID.TBODY, TAG_ID.TFOOT, TAG_ID.THEAD, TAG_ID.TEMPLATE, TAG_ID.HTML]), TABLE_CONTEXT = /* @__PURE__ */ new Set([TAG_ID.TABLE, TAG_ID.TEMPLATE, TAG_ID.HTML]), TABLE_CELLS = /* @__PURE__ */ new Set([TAG_ID.TD, TAG_ID.TH]), OpenElementStack = class {
  get currentTmplContentOrNode() {
    return this._isInTemplate() ? this.treeAdapter.getTemplateContent(this.current) : this.current;
  }
  constructor(document, treeAdapter, handler) {
    this.treeAdapter = treeAdapter, this.handler = handler, this.items = [], this.tagIDs = [], this.stackTop = -1, this.tmplCount = 0, this.currentTagId = TAG_ID.UNKNOWN, this.current = document;
  }
  //Index of element
  _indexOf(element) {
    return this.items.lastIndexOf(element, this.stackTop);
  }
  //Update current element
  _isInTemplate() {
    return this.currentTagId === TAG_ID.TEMPLATE && this.treeAdapter.getNamespaceURI(this.current) === NS.HTML;
  }
  _updateCurrentElement() {
    this.current = this.items[this.stackTop], this.currentTagId = this.tagIDs[this.stackTop];
  }
  //Mutations
  push(element, tagID) {
    this.stackTop++, this.items[this.stackTop] = element, this.current = element, this.tagIDs[this.stackTop] = tagID, this.currentTagId = tagID, this._isInTemplate() && this.tmplCount++, this.handler.onItemPush(element, tagID, !0);
  }
  pop() {
    let popped = this.current;
    this.tmplCount > 0 && this._isInTemplate() && this.tmplCount--, this.stackTop--, this._updateCurrentElement(), this.handler.onItemPop(popped, !0);
  }
  replace(oldElement, newElement) {
    let idx = this._indexOf(oldElement);
    this.items[idx] = newElement, idx === this.stackTop && (this.current = newElement);
  }
  insertAfter(referenceElement, newElement, newElementID) {
    let insertionIdx = this._indexOf(referenceElement) + 1;
    this.items.splice(insertionIdx, 0, newElement), this.tagIDs.splice(insertionIdx, 0, newElementID), this.stackTop++, insertionIdx === this.stackTop && this._updateCurrentElement(), this.current && this.currentTagId !== void 0 && this.handler.onItemPush(this.current, this.currentTagId, insertionIdx === this.stackTop);
  }
  popUntilTagNamePopped(tagName) {
    let targetIdx = this.stackTop + 1;
    do
      targetIdx = this.tagIDs.lastIndexOf(tagName, targetIdx - 1);
    while (targetIdx > 0 && this.treeAdapter.getNamespaceURI(this.items[targetIdx]) !== NS.HTML);
    this.shortenToLength(Math.max(targetIdx, 0));
  }
  shortenToLength(idx) {
    for (; this.stackTop >= idx; ) {
      let popped = this.current;
      this.tmplCount > 0 && this._isInTemplate() && (this.tmplCount -= 1), this.stackTop--, this._updateCurrentElement(), this.handler.onItemPop(popped, this.stackTop < idx);
    }
  }
  popUntilElementPopped(element) {
    let idx = this._indexOf(element);
    this.shortenToLength(Math.max(idx, 0));
  }
  popUntilPopped(tagNames, targetNS) {
    let idx = this._indexOfTagNames(tagNames, targetNS);
    this.shortenToLength(Math.max(idx, 0));
  }
  popUntilNumberedHeaderPopped() {
    this.popUntilPopped(NUMBERED_HEADERS, NS.HTML);
  }
  popUntilTableCellPopped() {
    this.popUntilPopped(TABLE_CELLS, NS.HTML);
  }
  popAllUpToHtmlElement() {
    this.tmplCount = 0, this.shortenToLength(1);
  }
  _indexOfTagNames(tagNames, namespace) {
    for (let i = this.stackTop; i >= 0; i--)
      if (tagNames.has(this.tagIDs[i]) && this.treeAdapter.getNamespaceURI(this.items[i]) === namespace)
        return i;
    return -1;
  }
  clearBackTo(tagNames, targetNS) {
    let idx = this._indexOfTagNames(tagNames, targetNS);
    this.shortenToLength(idx + 1);
  }
  clearBackToTableContext() {
    this.clearBackTo(TABLE_CONTEXT, NS.HTML);
  }
  clearBackToTableBodyContext() {
    this.clearBackTo(TABLE_BODY_CONTEXT, NS.HTML);
  }
  clearBackToTableRowContext() {
    this.clearBackTo(TABLE_ROW_CONTEXT, NS.HTML);
  }
  remove(element) {
    let idx = this._indexOf(element);
    idx >= 0 && (idx === this.stackTop ? this.pop() : (this.items.splice(idx, 1), this.tagIDs.splice(idx, 1), this.stackTop--, this._updateCurrentElement(), this.handler.onItemPop(element, !1)));
  }
  //Search
  tryPeekProperlyNestedBodyElement() {
    return this.stackTop >= 1 && this.tagIDs[1] === TAG_ID.BODY ? this.items[1] : null;
  }
  contains(element) {
    return this._indexOf(element) > -1;
  }
  getCommonAncestor(element) {
    let elementIdx = this._indexOf(element) - 1;
    return elementIdx >= 0 ? this.items[elementIdx] : null;
  }
  isRootHtmlElementCurrent() {
    return this.stackTop === 0 && this.tagIDs[0] === TAG_ID.HTML;
  }
  //Element in scope
  hasInDynamicScope(tagName, htmlScope) {
    for (let i = this.stackTop; i >= 0; i--) {
      let tn = this.tagIDs[i];
      switch (this.treeAdapter.getNamespaceURI(this.items[i])) {
        case NS.HTML: {
          if (tn === tagName)
            return !0;
          if (htmlScope.has(tn))
            return !1;
          break;
        }
        case NS.SVG: {
          if (SCOPING_ELEMENTS_SVG.has(tn))
            return !1;
          break;
        }
        case NS.MATHML: {
          if (SCOPING_ELEMENTS_MATHML.has(tn))
            return !1;
          break;
        }
      }
    }
    return !0;
  }
  hasInScope(tagName) {
    return this.hasInDynamicScope(tagName, SCOPING_ELEMENTS_HTML);
  }
  hasInListItemScope(tagName) {
    return this.hasInDynamicScope(tagName, SCOPING_ELEMENTS_HTML_LIST);
  }
  hasInButtonScope(tagName) {
    return this.hasInDynamicScope(tagName, SCOPING_ELEMENTS_HTML_BUTTON);
  }
  hasNumberedHeaderInScope() {
    for (let i = this.stackTop; i >= 0; i--) {
      let tn = this.tagIDs[i];
      switch (this.treeAdapter.getNamespaceURI(this.items[i])) {
        case NS.HTML: {
          if (NUMBERED_HEADERS.has(tn))
            return !0;
          if (SCOPING_ELEMENTS_HTML.has(tn))
            return !1;
          break;
        }
        case NS.SVG: {
          if (SCOPING_ELEMENTS_SVG.has(tn))
            return !1;
          break;
        }
        case NS.MATHML: {
          if (SCOPING_ELEMENTS_MATHML.has(tn))
            return !1;
          break;
        }
      }
    }
    return !0;
  }
  hasInTableScope(tagName) {
    for (let i = this.stackTop; i >= 0; i--)
      if (this.treeAdapter.getNamespaceURI(this.items[i]) === NS.HTML)
        switch (this.tagIDs[i]) {
          case tagName:
            return !0;
          case TAG_ID.TABLE:
          case TAG_ID.HTML:
            return !1;
        }
    return !0;
  }
  hasTableBodyContextInTableScope() {
    for (let i = this.stackTop; i >= 0; i--)
      if (this.treeAdapter.getNamespaceURI(this.items[i]) === NS.HTML)
        switch (this.tagIDs[i]) {
          case TAG_ID.TBODY:
          case TAG_ID.THEAD:
          case TAG_ID.TFOOT:
            return !0;
          case TAG_ID.TABLE:
          case TAG_ID.HTML:
            return !1;
        }
    return !0;
  }
  hasInSelectScope(tagName) {
    for (let i = this.stackTop; i >= 0; i--)
      if (this.treeAdapter.getNamespaceURI(this.items[i]) === NS.HTML)
        switch (this.tagIDs[i]) {
          case tagName:
            return !0;
          case TAG_ID.OPTION:
          case TAG_ID.OPTGROUP:
            break;
          default:
            return !1;
        }
    return !0;
  }
  //Implied end tags
  generateImpliedEndTags() {
    for (; this.currentTagId !== void 0 && IMPLICIT_END_TAG_REQUIRED.has(this.currentTagId); )
      this.pop();
  }
  generateImpliedEndTagsThoroughly() {
    for (; this.currentTagId !== void 0 && IMPLICIT_END_TAG_REQUIRED_THOROUGHLY.has(this.currentTagId); )
      this.pop();
  }
  generateImpliedEndTagsWithExclusion(exclusionId) {
    for (; this.currentTagId !== void 0 && this.currentTagId !== exclusionId && IMPLICIT_END_TAG_REQUIRED_THOROUGHLY.has(this.currentTagId); )
      this.pop();
  }
};

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/parser/formatting-element-list.js
var EntryType;
(function(EntryType2) {
  EntryType2[EntryType2.Marker = 0] = "Marker", EntryType2[EntryType2.Element = 1] = "Element";
})(EntryType || (EntryType = {}));
var MARKER = { type: EntryType.Marker }, FormattingElementList = class {
  constructor(treeAdapter) {
    this.treeAdapter = treeAdapter, this.entries = [], this.bookmark = null;
  }
  //Noah Ark's condition
  //OPTIMIZATION: at first we try to find possible candidates for exclusion using
  //lightweight heuristics without thorough attributes check.
  _getNoahArkConditionCandidates(newElement, neAttrs) {
    let candidates = [], neAttrsLength = neAttrs.length, neTagName = this.treeAdapter.getTagName(newElement), neNamespaceURI = this.treeAdapter.getNamespaceURI(newElement);
    for (let i = 0; i < this.entries.length; i++) {
      let entry = this.entries[i];
      if (entry.type === EntryType.Marker)
        break;
      let { element } = entry;
      if (this.treeAdapter.getTagName(element) === neTagName && this.treeAdapter.getNamespaceURI(element) === neNamespaceURI) {
        let elementAttrs = this.treeAdapter.getAttrList(element);
        elementAttrs.length === neAttrsLength && candidates.push({ idx: i, attrs: elementAttrs });
      }
    }
    return candidates;
  }
  _ensureNoahArkCondition(newElement) {
    if (this.entries.length < 3)
      return;
    let neAttrs = this.treeAdapter.getAttrList(newElement), candidates = this._getNoahArkConditionCandidates(newElement, neAttrs);
    if (candidates.length < 3)
      return;
    let neAttrsMap = new Map(neAttrs.map((neAttr) => [neAttr.name, neAttr.value])), validCandidates = 0;
    for (let i = 0; i < candidates.length; i++) {
      let candidate = candidates[i];
      candidate.attrs.every((cAttr) => neAttrsMap.get(cAttr.name) === cAttr.value) && (validCandidates += 1, validCandidates >= 3 && this.entries.splice(candidate.idx, 1));
    }
  }
  //Mutations
  insertMarker() {
    this.entries.unshift(MARKER);
  }
  pushElement(element, token) {
    this._ensureNoahArkCondition(element), this.entries.unshift({
      type: EntryType.Element,
      element,
      token
    });
  }
  insertElementAfterBookmark(element, token) {
    let bookmarkIdx = this.entries.indexOf(this.bookmark);
    this.entries.splice(bookmarkIdx, 0, {
      type: EntryType.Element,
      element,
      token
    });
  }
  removeEntry(entry) {
    let entryIndex = this.entries.indexOf(entry);
    entryIndex !== -1 && this.entries.splice(entryIndex, 1);
  }
  /**
   * Clears the list of formatting elements up to the last marker.
   *
   * @see https://html.spec.whatwg.org/multipage/parsing.html#clear-the-list-of-active-formatting-elements-up-to-the-last-marker
   */
  clearToLastMarker() {
    let markerIdx = this.entries.indexOf(MARKER);
    markerIdx === -1 ? this.entries.length = 0 : this.entries.splice(0, markerIdx + 1);
  }
  //Search
  getElementEntryInScopeWithTagName(tagName) {
    let entry = this.entries.find((entry2) => entry2.type === EntryType.Marker || this.treeAdapter.getTagName(entry2.element) === tagName);
    return entry && entry.type === EntryType.Element ? entry : null;
  }
  getElementEntry(element) {
    return this.entries.find((entry) => entry.type === EntryType.Element && entry.element === element);
  }
};

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/tree-adapters/default.js
var defaultTreeAdapter = {
  //Node construction
  createDocument() {
    return {
      nodeName: "#document",
      mode: DOCUMENT_MODE.NO_QUIRKS,
      childNodes: []
    };
  },
  createDocumentFragment() {
    return {
      nodeName: "#document-fragment",
      childNodes: []
    };
  },
  createElement(tagName, namespaceURI, attrs) {
    return {
      nodeName: tagName,
      tagName,
      attrs,
      namespaceURI,
      childNodes: [],
      parentNode: null
    };
  },
  createCommentNode(data) {
    return {
      nodeName: "#comment",
      data,
      parentNode: null
    };
  },
  createTextNode(value) {
    return {
      nodeName: "#text",
      value,
      parentNode: null
    };
  },
  //Tree mutation
  appendChild(parentNode, newNode) {
    parentNode.childNodes.push(newNode), newNode.parentNode = parentNode;
  },
  insertBefore(parentNode, newNode, referenceNode) {
    let insertionIdx = parentNode.childNodes.indexOf(referenceNode);
    parentNode.childNodes.splice(insertionIdx, 0, newNode), newNode.parentNode = parentNode;
  },
  setTemplateContent(templateElement, contentElement) {
    templateElement.content = contentElement;
  },
  getTemplateContent(templateElement) {
    return templateElement.content;
  },
  setDocumentType(document, name, publicId, systemId) {
    let doctypeNode = document.childNodes.find((node) => node.nodeName === "#documentType");
    if (doctypeNode)
      doctypeNode.name = name, doctypeNode.publicId = publicId, doctypeNode.systemId = systemId;
    else {
      let node = {
        nodeName: "#documentType",
        name,
        publicId,
        systemId,
        parentNode: null
      };
      defaultTreeAdapter.appendChild(document, node);
    }
  },
  setDocumentMode(document, mode) {
    document.mode = mode;
  },
  getDocumentMode(document) {
    return document.mode;
  },
  detachNode(node) {
    if (node.parentNode) {
      let idx = node.parentNode.childNodes.indexOf(node);
      node.parentNode.childNodes.splice(idx, 1), node.parentNode = null;
    }
  },
  insertText(parentNode, text) {
    if (parentNode.childNodes.length > 0) {
      let prevNode = parentNode.childNodes[parentNode.childNodes.length - 1];
      if (defaultTreeAdapter.isTextNode(prevNode)) {
        prevNode.value += text;
        return;
      }
    }
    defaultTreeAdapter.appendChild(parentNode, defaultTreeAdapter.createTextNode(text));
  },
  insertTextBefore(parentNode, text, referenceNode) {
    let prevNode = parentNode.childNodes[parentNode.childNodes.indexOf(referenceNode) - 1];
    prevNode && defaultTreeAdapter.isTextNode(prevNode) ? prevNode.value += text : defaultTreeAdapter.insertBefore(parentNode, defaultTreeAdapter.createTextNode(text), referenceNode);
  },
  adoptAttributes(recipient, attrs) {
    let recipientAttrsMap = new Set(recipient.attrs.map((attr) => attr.name));
    for (let j = 0; j < attrs.length; j++)
      recipientAttrsMap.has(attrs[j].name) || recipient.attrs.push(attrs[j]);
  },
  //Tree traversing
  getFirstChild(node) {
    return node.childNodes[0];
  },
  getChildNodes(node) {
    return node.childNodes;
  },
  getParentNode(node) {
    return node.parentNode;
  },
  getAttrList(element) {
    return element.attrs;
  },
  //Node data
  getTagName(element) {
    return element.tagName;
  },
  getNamespaceURI(element) {
    return element.namespaceURI;
  },
  getTextNodeContent(textNode) {
    return textNode.value;
  },
  getCommentNodeContent(commentNode) {
    return commentNode.data;
  },
  getDocumentTypeNodeName(doctypeNode) {
    return doctypeNode.name;
  },
  getDocumentTypeNodePublicId(doctypeNode) {
    return doctypeNode.publicId;
  },
  getDocumentTypeNodeSystemId(doctypeNode) {
    return doctypeNode.systemId;
  },
  //Node types
  isTextNode(node) {
    return node.nodeName === "#text";
  },
  isCommentNode(node) {
    return node.nodeName === "#comment";
  },
  isDocumentTypeNode(node) {
    return node.nodeName === "#documentType";
  },
  isElementNode(node) {
    return Object.prototype.hasOwnProperty.call(node, "tagName");
  },
  // Source code location
  setNodeSourceCodeLocation(node, location) {
    node.sourceCodeLocation = location;
  },
  getNodeSourceCodeLocation(node) {
    return node.sourceCodeLocation;
  },
  updateNodeSourceCodeLocation(node, endLocation) {
    node.sourceCodeLocation = { ...node.sourceCodeLocation, ...endLocation };
  }
};

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/common/doctype.js
var VALID_DOCTYPE_NAME = "html", VALID_SYSTEM_ID = "about:legacy-compat", QUIRKS_MODE_SYSTEM_ID = "http://www.ibm.com/data/dtd/v11/ibmxhtml1-transitional.dtd", QUIRKS_MODE_PUBLIC_ID_PREFIXES = [
  "+//silmaril//dtd html pro v0r11 19970101//",
  "-//as//dtd html 3.0 aswedit + extensions//",
  "-//advasoft ltd//dtd html 3.0 aswedit + extensions//",
  "-//ietf//dtd html 2.0 level 1//",
  "-//ietf//dtd html 2.0 level 2//",
  "-//ietf//dtd html 2.0 strict level 1//",
  "-//ietf//dtd html 2.0 strict level 2//",
  "-//ietf//dtd html 2.0 strict//",
  "-//ietf//dtd html 2.0//",
  "-//ietf//dtd html 2.1e//",
  "-//ietf//dtd html 3.0//",
  "-//ietf//dtd html 3.2 final//",
  "-//ietf//dtd html 3.2//",
  "-//ietf//dtd html 3//",
  "-//ietf//dtd html level 0//",
  "-//ietf//dtd html level 1//",
  "-//ietf//dtd html level 2//",
  "-//ietf//dtd html level 3//",
  "-//ietf//dtd html strict level 0//",
  "-//ietf//dtd html strict level 1//",
  "-//ietf//dtd html strict level 2//",
  "-//ietf//dtd html strict level 3//",
  "-//ietf//dtd html strict//",
  "-//ietf//dtd html//",
  "-//metrius//dtd metrius presentational//",
  "-//microsoft//dtd internet explorer 2.0 html strict//",
  "-//microsoft//dtd internet explorer 2.0 html//",
  "-//microsoft//dtd internet explorer 2.0 tables//",
  "-//microsoft//dtd internet explorer 3.0 html strict//",
  "-//microsoft//dtd internet explorer 3.0 html//",
  "-//microsoft//dtd internet explorer 3.0 tables//",
  "-//netscape comm. corp.//dtd html//",
  "-//netscape comm. corp.//dtd strict html//",
  "-//o'reilly and associates//dtd html 2.0//",
  "-//o'reilly and associates//dtd html extended 1.0//",
  "-//o'reilly and associates//dtd html extended relaxed 1.0//",
  "-//sq//dtd html 2.0 hotmetal + extensions//",
  "-//softquad software//dtd hotmetal pro 6.0::19990601::extensions to html 4.0//",
  "-//softquad//dtd hotmetal pro 4.0::19971010::extensions to html 4.0//",
  "-//spyglass//dtd html 2.0 extended//",
  "-//sun microsystems corp.//dtd hotjava html//",
  "-//sun microsystems corp.//dtd hotjava strict html//",
  "-//w3c//dtd html 3 1995-03-24//",
  "-//w3c//dtd html 3.2 draft//",
  "-//w3c//dtd html 3.2 final//",
  "-//w3c//dtd html 3.2//",
  "-//w3c//dtd html 3.2s draft//",
  "-//w3c//dtd html 4.0 frameset//",
  "-//w3c//dtd html 4.0 transitional//",
  "-//w3c//dtd html experimental 19960712//",
  "-//w3c//dtd html experimental 970421//",
  "-//w3c//dtd w3 html//",
  "-//w3o//dtd w3 html 3.0//",
  "-//webtechs//dtd mozilla html 2.0//",
  "-//webtechs//dtd mozilla html//"
], QUIRKS_MODE_NO_SYSTEM_ID_PUBLIC_ID_PREFIXES = [
  ...QUIRKS_MODE_PUBLIC_ID_PREFIXES,
  "-//w3c//dtd html 4.01 frameset//",
  "-//w3c//dtd html 4.01 transitional//"
], QUIRKS_MODE_PUBLIC_IDS = /* @__PURE__ */ new Set([
  "-//w3o//dtd w3 html strict 3.0//en//",
  "-/w3c/dtd html 4.0 transitional/en",
  "html"
]), LIMITED_QUIRKS_PUBLIC_ID_PREFIXES = ["-//w3c//dtd xhtml 1.0 frameset//", "-//w3c//dtd xhtml 1.0 transitional//"], LIMITED_QUIRKS_WITH_SYSTEM_ID_PUBLIC_ID_PREFIXES = [
  ...LIMITED_QUIRKS_PUBLIC_ID_PREFIXES,
  "-//w3c//dtd html 4.01 frameset//",
  "-//w3c//dtd html 4.01 transitional//"
];
function hasPrefix(publicId, prefixes) {
  return prefixes.some((prefix) => publicId.startsWith(prefix));
}
function isConforming(token) {
  return token.name === VALID_DOCTYPE_NAME && token.publicId === null && (token.systemId === null || token.systemId === VALID_SYSTEM_ID);
}
function getDocumentMode(token) {
  if (token.name !== VALID_DOCTYPE_NAME)
    return DOCUMENT_MODE.QUIRKS;
  let { systemId } = token;
  if (systemId && systemId.toLowerCase() === QUIRKS_MODE_SYSTEM_ID)
    return DOCUMENT_MODE.QUIRKS;
  let { publicId } = token;
  if (publicId !== null) {
    if (publicId = publicId.toLowerCase(), QUIRKS_MODE_PUBLIC_IDS.has(publicId))
      return DOCUMENT_MODE.QUIRKS;
    let prefixes = systemId === null ? QUIRKS_MODE_NO_SYSTEM_ID_PUBLIC_ID_PREFIXES : QUIRKS_MODE_PUBLIC_ID_PREFIXES;
    if (hasPrefix(publicId, prefixes))
      return DOCUMENT_MODE.QUIRKS;
    if (prefixes = systemId === null ? LIMITED_QUIRKS_PUBLIC_ID_PREFIXES : LIMITED_QUIRKS_WITH_SYSTEM_ID_PUBLIC_ID_PREFIXES, hasPrefix(publicId, prefixes))
      return DOCUMENT_MODE.LIMITED_QUIRKS;
  }
  return DOCUMENT_MODE.NO_QUIRKS;
}

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/common/foreign-content.js
var MIME_TYPES = {
  TEXT_HTML: "text/html",
  APPLICATION_XML: "application/xhtml+xml"
}, DEFINITION_URL_ATTR = "definitionurl", ADJUSTED_DEFINITION_URL_ATTR = "definitionURL", SVG_ATTRS_ADJUSTMENT_MAP = new Map([
  "attributeName",
  "attributeType",
  "baseFrequency",
  "baseProfile",
  "calcMode",
  "clipPathUnits",
  "diffuseConstant",
  "edgeMode",
  "filterUnits",
  "glyphRef",
  "gradientTransform",
  "gradientUnits",
  "kernelMatrix",
  "kernelUnitLength",
  "keyPoints",
  "keySplines",
  "keyTimes",
  "lengthAdjust",
  "limitingConeAngle",
  "markerHeight",
  "markerUnits",
  "markerWidth",
  "maskContentUnits",
  "maskUnits",
  "numOctaves",
  "pathLength",
  "patternContentUnits",
  "patternTransform",
  "patternUnits",
  "pointsAtX",
  "pointsAtY",
  "pointsAtZ",
  "preserveAlpha",
  "preserveAspectRatio",
  "primitiveUnits",
  "refX",
  "refY",
  "repeatCount",
  "repeatDur",
  "requiredExtensions",
  "requiredFeatures",
  "specularConstant",
  "specularExponent",
  "spreadMethod",
  "startOffset",
  "stdDeviation",
  "stitchTiles",
  "surfaceScale",
  "systemLanguage",
  "tableValues",
  "targetX",
  "targetY",
  "textLength",
  "viewBox",
  "viewTarget",
  "xChannelSelector",
  "yChannelSelector",
  "zoomAndPan"
].map((attr) => [attr.toLowerCase(), attr])), XML_ATTRS_ADJUSTMENT_MAP = /* @__PURE__ */ new Map([
  ["xlink:actuate", { prefix: "xlink", name: "actuate", namespace: NS.XLINK }],
  ["xlink:arcrole", { prefix: "xlink", name: "arcrole", namespace: NS.XLINK }],
  ["xlink:href", { prefix: "xlink", name: "href", namespace: NS.XLINK }],
  ["xlink:role", { prefix: "xlink", name: "role", namespace: NS.XLINK }],
  ["xlink:show", { prefix: "xlink", name: "show", namespace: NS.XLINK }],
  ["xlink:title", { prefix: "xlink", name: "title", namespace: NS.XLINK }],
  ["xlink:type", { prefix: "xlink", name: "type", namespace: NS.XLINK }],
  ["xml:lang", { prefix: "xml", name: "lang", namespace: NS.XML }],
  ["xml:space", { prefix: "xml", name: "space", namespace: NS.XML }],
  ["xmlns", { prefix: "", name: "xmlns", namespace: NS.XMLNS }],
  ["xmlns:xlink", { prefix: "xmlns", name: "xlink", namespace: NS.XMLNS }]
]), SVG_TAG_NAMES_ADJUSTMENT_MAP = new Map([
  "altGlyph",
  "altGlyphDef",
  "altGlyphItem",
  "animateColor",
  "animateMotion",
  "animateTransform",
  "clipPath",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "foreignObject",
  "glyphRef",
  "linearGradient",
  "radialGradient",
  "textPath"
].map((tn) => [tn.toLowerCase(), tn])), EXITS_FOREIGN_CONTENT = /* @__PURE__ */ new Set([
  TAG_ID.B,
  TAG_ID.BIG,
  TAG_ID.BLOCKQUOTE,
  TAG_ID.BODY,
  TAG_ID.BR,
  TAG_ID.CENTER,
  TAG_ID.CODE,
  TAG_ID.DD,
  TAG_ID.DIV,
  TAG_ID.DL,
  TAG_ID.DT,
  TAG_ID.EM,
  TAG_ID.EMBED,
  TAG_ID.H1,
  TAG_ID.H2,
  TAG_ID.H3,
  TAG_ID.H4,
  TAG_ID.H5,
  TAG_ID.H6,
  TAG_ID.HEAD,
  TAG_ID.HR,
  TAG_ID.I,
  TAG_ID.IMG,
  TAG_ID.LI,
  TAG_ID.LISTING,
  TAG_ID.MENU,
  TAG_ID.META,
  TAG_ID.NOBR,
  TAG_ID.OL,
  TAG_ID.P,
  TAG_ID.PRE,
  TAG_ID.RUBY,
  TAG_ID.S,
  TAG_ID.SMALL,
  TAG_ID.SPAN,
  TAG_ID.STRONG,
  TAG_ID.STRIKE,
  TAG_ID.SUB,
  TAG_ID.SUP,
  TAG_ID.TABLE,
  TAG_ID.TT,
  TAG_ID.U,
  TAG_ID.UL,
  TAG_ID.VAR
]);
function causesExit(startTagToken) {
  let tn = startTagToken.tagID;
  return tn === TAG_ID.FONT && startTagToken.attrs.some(({ name }) => name === ATTRS.COLOR || name === ATTRS.SIZE || name === ATTRS.FACE) || EXITS_FOREIGN_CONTENT.has(tn);
}
function adjustTokenMathMLAttrs(token) {
  for (let i = 0; i < token.attrs.length; i++)
    if (token.attrs[i].name === DEFINITION_URL_ATTR) {
      token.attrs[i].name = ADJUSTED_DEFINITION_URL_ATTR;
      break;
    }
}
function adjustTokenSVGAttrs(token) {
  for (let i = 0; i < token.attrs.length; i++) {
    let adjustedAttrName = SVG_ATTRS_ADJUSTMENT_MAP.get(token.attrs[i].name);
    adjustedAttrName != null && (token.attrs[i].name = adjustedAttrName);
  }
}
function adjustTokenXMLAttrs(token) {
  for (let i = 0; i < token.attrs.length; i++) {
    let adjustedAttrEntry = XML_ATTRS_ADJUSTMENT_MAP.get(token.attrs[i].name);
    adjustedAttrEntry && (token.attrs[i].prefix = adjustedAttrEntry.prefix, token.attrs[i].name = adjustedAttrEntry.name, token.attrs[i].namespace = adjustedAttrEntry.namespace);
  }
}
function adjustTokenSVGTagName(token) {
  let adjustedTagName = SVG_TAG_NAMES_ADJUSTMENT_MAP.get(token.tagName);
  adjustedTagName != null && (token.tagName = adjustedTagName, token.tagID = getTagID(token.tagName));
}
function isMathMLTextIntegrationPoint(tn, ns) {
  return ns === NS.MATHML && (tn === TAG_ID.MI || tn === TAG_ID.MO || tn === TAG_ID.MN || tn === TAG_ID.MS || tn === TAG_ID.MTEXT);
}
function isHtmlIntegrationPoint(tn, ns, attrs) {
  if (ns === NS.MATHML && tn === TAG_ID.ANNOTATION_XML) {
    for (let i = 0; i < attrs.length; i++)
      if (attrs[i].name === ATTRS.ENCODING) {
        let value = attrs[i].value.toLowerCase();
        return value === MIME_TYPES.TEXT_HTML || value === MIME_TYPES.APPLICATION_XML;
      }
  }
  return ns === NS.SVG && (tn === TAG_ID.FOREIGN_OBJECT || tn === TAG_ID.DESC || tn === TAG_ID.TITLE);
}
function isIntegrationPoint(tn, ns, attrs, foreignNS) {
  return (!foreignNS || foreignNS === NS.HTML) && isHtmlIntegrationPoint(tn, ns, attrs) || (!foreignNS || foreignNS === NS.MATHML) && isMathMLTextIntegrationPoint(tn, ns);
}

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/parser/index.js
var HIDDEN_INPUT_TYPE = "hidden", AA_OUTER_LOOP_ITER = 8, AA_INNER_LOOP_ITER = 3, InsertionMode;
(function(InsertionMode2) {
  InsertionMode2[InsertionMode2.INITIAL = 0] = "INITIAL", InsertionMode2[InsertionMode2.BEFORE_HTML = 1] = "BEFORE_HTML", InsertionMode2[InsertionMode2.BEFORE_HEAD = 2] = "BEFORE_HEAD", InsertionMode2[InsertionMode2.IN_HEAD = 3] = "IN_HEAD", InsertionMode2[InsertionMode2.IN_HEAD_NO_SCRIPT = 4] = "IN_HEAD_NO_SCRIPT", InsertionMode2[InsertionMode2.AFTER_HEAD = 5] = "AFTER_HEAD", InsertionMode2[InsertionMode2.IN_BODY = 6] = "IN_BODY", InsertionMode2[InsertionMode2.TEXT = 7] = "TEXT", InsertionMode2[InsertionMode2.IN_TABLE = 8] = "IN_TABLE", InsertionMode2[InsertionMode2.IN_TABLE_TEXT = 9] = "IN_TABLE_TEXT", InsertionMode2[InsertionMode2.IN_CAPTION = 10] = "IN_CAPTION", InsertionMode2[InsertionMode2.IN_COLUMN_GROUP = 11] = "IN_COLUMN_GROUP", InsertionMode2[InsertionMode2.IN_TABLE_BODY = 12] = "IN_TABLE_BODY", InsertionMode2[InsertionMode2.IN_ROW = 13] = "IN_ROW", InsertionMode2[InsertionMode2.IN_CELL = 14] = "IN_CELL", InsertionMode2[InsertionMode2.IN_SELECT = 15] = "IN_SELECT", InsertionMode2[InsertionMode2.IN_SELECT_IN_TABLE = 16] = "IN_SELECT_IN_TABLE", InsertionMode2[InsertionMode2.IN_TEMPLATE = 17] = "IN_TEMPLATE", InsertionMode2[InsertionMode2.AFTER_BODY = 18] = "AFTER_BODY", InsertionMode2[InsertionMode2.IN_FRAMESET = 19] = "IN_FRAMESET", InsertionMode2[InsertionMode2.AFTER_FRAMESET = 20] = "AFTER_FRAMESET", InsertionMode2[InsertionMode2.AFTER_AFTER_BODY = 21] = "AFTER_AFTER_BODY", InsertionMode2[InsertionMode2.AFTER_AFTER_FRAMESET = 22] = "AFTER_AFTER_FRAMESET";
})(InsertionMode || (InsertionMode = {}));
var BASE_LOC = {
  startLine: -1,
  startCol: -1,
  startOffset: -1,
  endLine: -1,
  endCol: -1,
  endOffset: -1
}, TABLE_STRUCTURE_TAGS = /* @__PURE__ */ new Set([TAG_ID.TABLE, TAG_ID.TBODY, TAG_ID.TFOOT, TAG_ID.THEAD, TAG_ID.TR]), defaultParserOptions = {
  scriptingEnabled: !0,
  sourceCodeLocationInfo: !1,
  treeAdapter: defaultTreeAdapter,
  onParseError: null
}, Parser = class {
  constructor(options, document, fragmentContext = null, scriptHandler = null) {
    this.fragmentContext = fragmentContext, this.scriptHandler = scriptHandler, this.currentToken = null, this.stopped = !1, this.insertionMode = InsertionMode.INITIAL, this.originalInsertionMode = InsertionMode.INITIAL, this.headElement = null, this.formElement = null, this.currentNotInHTML = !1, this.tmplInsertionModeStack = [], this.pendingCharacterTokens = [], this.hasNonWhitespacePendingCharacterToken = !1, this.framesetOk = !0, this.skipNextNewLine = !1, this.fosterParentingEnabled = !1, this.options = {
      ...defaultParserOptions,
      ...options
    }, this.treeAdapter = this.options.treeAdapter, this.onParseError = this.options.onParseError, this.onParseError && (this.options.sourceCodeLocationInfo = !0), this.document = document ?? this.treeAdapter.createDocument(), this.tokenizer = new Tokenizer(this.options, this), this.activeFormattingElements = new FormattingElementList(this.treeAdapter), this.fragmentContextID = fragmentContext ? getTagID(this.treeAdapter.getTagName(fragmentContext)) : TAG_ID.UNKNOWN, this._setContextModes(fragmentContext ?? this.document, this.fragmentContextID), this.openElements = new OpenElementStack(this.document, this.treeAdapter, this);
  }
  // API
  static parse(html, options) {
    let parser = new this(options);
    return parser.tokenizer.write(html, !0), parser.document;
  }
  static getFragmentParser(fragmentContext, options) {
    let opts = {
      ...defaultParserOptions,
      ...options
    };
    fragmentContext ?? (fragmentContext = opts.treeAdapter.createElement(TAG_NAMES.TEMPLATE, NS.HTML, []));
    let documentMock = opts.treeAdapter.createElement("documentmock", NS.HTML, []), parser = new this(opts, documentMock, fragmentContext);
    return parser.fragmentContextID === TAG_ID.TEMPLATE && parser.tmplInsertionModeStack.unshift(InsertionMode.IN_TEMPLATE), parser._initTokenizerForFragmentParsing(), parser._insertFakeRootElement(), parser._resetInsertionMode(), parser._findFormInFragmentContext(), parser;
  }
  getFragment() {
    let rootElement = this.treeAdapter.getFirstChild(this.document), fragment = this.treeAdapter.createDocumentFragment();
    return this._adoptNodes(rootElement, fragment), fragment;
  }
  //Errors
  /** @internal */
  _err(token, code, beforeToken) {
    var _a;
    if (!this.onParseError)
      return;
    let loc = (_a = token.location) !== null && _a !== void 0 ? _a : BASE_LOC, err = {
      code,
      startLine: loc.startLine,
      startCol: loc.startCol,
      startOffset: loc.startOffset,
      endLine: beforeToken ? loc.startLine : loc.endLine,
      endCol: beforeToken ? loc.startCol : loc.endCol,
      endOffset: beforeToken ? loc.startOffset : loc.endOffset
    };
    this.onParseError(err);
  }
  //Stack events
  /** @internal */
  onItemPush(node, tid, isTop) {
    var _a, _b;
    (_b = (_a = this.treeAdapter).onItemPush) === null || _b === void 0 || _b.call(_a, node), isTop && this.openElements.stackTop > 0 && this._setContextModes(node, tid);
  }
  /** @internal */
  onItemPop(node, isTop) {
    var _a, _b;
    if (this.options.sourceCodeLocationInfo && this._setEndLocation(node, this.currentToken), (_b = (_a = this.treeAdapter).onItemPop) === null || _b === void 0 || _b.call(_a, node, this.openElements.current), isTop) {
      let current, currentTagId;
      this.openElements.stackTop === 0 && this.fragmentContext ? (current = this.fragmentContext, currentTagId = this.fragmentContextID) : { current, currentTagId } = this.openElements, this._setContextModes(current, currentTagId);
    }
  }
  _setContextModes(current, tid) {
    let isHTML = current === this.document || current && this.treeAdapter.getNamespaceURI(current) === NS.HTML;
    this.currentNotInHTML = !isHTML, this.tokenizer.inForeignNode = !isHTML && current !== void 0 && tid !== void 0 && !this._isIntegrationPoint(tid, current);
  }
  /** @protected */
  _switchToTextParsing(currentToken, nextTokenizerState) {
    this._insertElement(currentToken, NS.HTML), this.tokenizer.state = nextTokenizerState, this.originalInsertionMode = this.insertionMode, this.insertionMode = InsertionMode.TEXT;
  }
  switchToPlaintextParsing() {
    this.insertionMode = InsertionMode.TEXT, this.originalInsertionMode = InsertionMode.IN_BODY, this.tokenizer.state = TokenizerMode.PLAINTEXT;
  }
  //Fragment parsing
  /** @protected */
  _getAdjustedCurrentElement() {
    return this.openElements.stackTop === 0 && this.fragmentContext ? this.fragmentContext : this.openElements.current;
  }
  /** @protected */
  _findFormInFragmentContext() {
    let node = this.fragmentContext;
    for (; node; ) {
      if (this.treeAdapter.getTagName(node) === TAG_NAMES.FORM) {
        this.formElement = node;
        break;
      }
      node = this.treeAdapter.getParentNode(node);
    }
  }
  _initTokenizerForFragmentParsing() {
    if (!(!this.fragmentContext || this.treeAdapter.getNamespaceURI(this.fragmentContext) !== NS.HTML))
      switch (this.fragmentContextID) {
        case TAG_ID.TITLE:
        case TAG_ID.TEXTAREA: {
          this.tokenizer.state = TokenizerMode.RCDATA;
          break;
        }
        case TAG_ID.STYLE:
        case TAG_ID.XMP:
        case TAG_ID.IFRAME:
        case TAG_ID.NOEMBED:
        case TAG_ID.NOFRAMES:
        case TAG_ID.NOSCRIPT: {
          this.tokenizer.state = TokenizerMode.RAWTEXT;
          break;
        }
        case TAG_ID.SCRIPT: {
          this.tokenizer.state = TokenizerMode.SCRIPT_DATA;
          break;
        }
        case TAG_ID.PLAINTEXT: {
          this.tokenizer.state = TokenizerMode.PLAINTEXT;
          break;
        }
        default:
      }
  }
  //Tree mutation
  /** @protected */
  _setDocumentType(token) {
    let name = token.name || "", publicId = token.publicId || "", systemId = token.systemId || "";
    if (this.treeAdapter.setDocumentType(this.document, name, publicId, systemId), token.location) {
      let docTypeNode = this.treeAdapter.getChildNodes(this.document).find((node) => this.treeAdapter.isDocumentTypeNode(node));
      docTypeNode && this.treeAdapter.setNodeSourceCodeLocation(docTypeNode, token.location);
    }
  }
  /** @protected */
  _attachElementToTree(element, location) {
    if (this.options.sourceCodeLocationInfo) {
      let loc = location && {
        ...location,
        startTag: location
      };
      this.treeAdapter.setNodeSourceCodeLocation(element, loc);
    }
    if (this._shouldFosterParentOnInsertion())
      this._fosterParentElement(element);
    else {
      let parent = this.openElements.currentTmplContentOrNode;
      this.treeAdapter.appendChild(parent ?? this.document, element);
    }
  }
  /**
   * For self-closing tags. Add an element to the tree, but skip adding it
   * to the stack.
   */
  /** @protected */
  _appendElement(token, namespaceURI) {
    let element = this.treeAdapter.createElement(token.tagName, namespaceURI, token.attrs);
    this._attachElementToTree(element, token.location);
  }
  /** @protected */
  _insertElement(token, namespaceURI) {
    let element = this.treeAdapter.createElement(token.tagName, namespaceURI, token.attrs);
    this._attachElementToTree(element, token.location), this.openElements.push(element, token.tagID);
  }
  /** @protected */
  _insertFakeElement(tagName, tagID) {
    let element = this.treeAdapter.createElement(tagName, NS.HTML, []);
    this._attachElementToTree(element, null), this.openElements.push(element, tagID);
  }
  /** @protected */
  _insertTemplate(token) {
    let tmpl = this.treeAdapter.createElement(token.tagName, NS.HTML, token.attrs), content = this.treeAdapter.createDocumentFragment();
    this.treeAdapter.setTemplateContent(tmpl, content), this._attachElementToTree(tmpl, token.location), this.openElements.push(tmpl, token.tagID), this.options.sourceCodeLocationInfo && this.treeAdapter.setNodeSourceCodeLocation(content, null);
  }
  /** @protected */
  _insertFakeRootElement() {
    let element = this.treeAdapter.createElement(TAG_NAMES.HTML, NS.HTML, []);
    this.options.sourceCodeLocationInfo && this.treeAdapter.setNodeSourceCodeLocation(element, null), this.treeAdapter.appendChild(this.openElements.current, element), this.openElements.push(element, TAG_ID.HTML);
  }
  /** @protected */
  _appendCommentNode(token, parent) {
    let commentNode = this.treeAdapter.createCommentNode(token.data);
    this.treeAdapter.appendChild(parent, commentNode), this.options.sourceCodeLocationInfo && this.treeAdapter.setNodeSourceCodeLocation(commentNode, token.location);
  }
  /** @protected */
  _insertCharacters(token) {
    let parent, beforeElement;
    if (this._shouldFosterParentOnInsertion() ? ({ parent, beforeElement } = this._findFosterParentingLocation(), beforeElement ? this.treeAdapter.insertTextBefore(parent, token.chars, beforeElement) : this.treeAdapter.insertText(parent, token.chars)) : (parent = this.openElements.currentTmplContentOrNode, this.treeAdapter.insertText(parent, token.chars)), !token.location)
      return;
    let siblings = this.treeAdapter.getChildNodes(parent), textNodeIdx = beforeElement ? siblings.lastIndexOf(beforeElement) : siblings.length, textNode = siblings[textNodeIdx - 1];
    if (this.treeAdapter.getNodeSourceCodeLocation(textNode)) {
      let { endLine, endCol, endOffset } = token.location;
      this.treeAdapter.updateNodeSourceCodeLocation(textNode, { endLine, endCol, endOffset });
    } else this.options.sourceCodeLocationInfo && this.treeAdapter.setNodeSourceCodeLocation(textNode, token.location);
  }
  /** @protected */
  _adoptNodes(donor, recipient) {
    for (let child = this.treeAdapter.getFirstChild(donor); child; child = this.treeAdapter.getFirstChild(donor))
      this.treeAdapter.detachNode(child), this.treeAdapter.appendChild(recipient, child);
  }
  /** @protected */
  _setEndLocation(element, closingToken) {
    if (this.treeAdapter.getNodeSourceCodeLocation(element) && closingToken.location) {
      let ctLoc = closingToken.location, tn = this.treeAdapter.getTagName(element), endLoc = (
        // NOTE: For cases like <p> <p> </p> - First 'p' closes without a closing
        // tag and for cases like <td> <p> </td> - 'p' closes without a closing tag.
        closingToken.type === TokenType.END_TAG && tn === closingToken.tagName ? {
          endTag: { ...ctLoc },
          endLine: ctLoc.endLine,
          endCol: ctLoc.endCol,
          endOffset: ctLoc.endOffset
        } : {
          endLine: ctLoc.startLine,
          endCol: ctLoc.startCol,
          endOffset: ctLoc.startOffset
        }
      );
      this.treeAdapter.updateNodeSourceCodeLocation(element, endLoc);
    }
  }
  //Token processing
  shouldProcessStartTagTokenInForeignContent(token) {
    if (!this.currentNotInHTML)
      return !1;
    let current, currentTagId;
    return this.openElements.stackTop === 0 && this.fragmentContext ? (current = this.fragmentContext, currentTagId = this.fragmentContextID) : { current, currentTagId } = this.openElements, token.tagID === TAG_ID.SVG && this.treeAdapter.getTagName(current) === TAG_NAMES.ANNOTATION_XML && this.treeAdapter.getNamespaceURI(current) === NS.MATHML ? !1 : (
      // Check that `current` is not an integration point for HTML or MathML elements.
      this.tokenizer.inForeignNode || // If it _is_ an integration point, then we might have to check that it is not an HTML
      // integration point.
      (token.tagID === TAG_ID.MGLYPH || token.tagID === TAG_ID.MALIGNMARK) && currentTagId !== void 0 && !this._isIntegrationPoint(currentTagId, current, NS.HTML)
    );
  }
  /** @protected */
  _processToken(token) {
    switch (token.type) {
      case TokenType.CHARACTER: {
        this.onCharacter(token);
        break;
      }
      case TokenType.NULL_CHARACTER: {
        this.onNullCharacter(token);
        break;
      }
      case TokenType.COMMENT: {
        this.onComment(token);
        break;
      }
      case TokenType.DOCTYPE: {
        this.onDoctype(token);
        break;
      }
      case TokenType.START_TAG: {
        this._processStartTag(token);
        break;
      }
      case TokenType.END_TAG: {
        this.onEndTag(token);
        break;
      }
      case TokenType.EOF: {
        this.onEof(token);
        break;
      }
      case TokenType.WHITESPACE_CHARACTER: {
        this.onWhitespaceCharacter(token);
        break;
      }
    }
  }
  //Integration points
  /** @protected */
  _isIntegrationPoint(tid, element, foreignNS) {
    let ns = this.treeAdapter.getNamespaceURI(element), attrs = this.treeAdapter.getAttrList(element);
    return isIntegrationPoint(tid, ns, attrs, foreignNS);
  }
  //Active formatting elements reconstruction
  /** @protected */
  _reconstructActiveFormattingElements() {
    let listLength = this.activeFormattingElements.entries.length;
    if (listLength) {
      let endIndex = this.activeFormattingElements.entries.findIndex((entry) => entry.type === EntryType.Marker || this.openElements.contains(entry.element)), unopenIdx = endIndex === -1 ? listLength - 1 : endIndex - 1;
      for (let i = unopenIdx; i >= 0; i--) {
        let entry = this.activeFormattingElements.entries[i];
        this._insertElement(entry.token, this.treeAdapter.getNamespaceURI(entry.element)), entry.element = this.openElements.current;
      }
    }
  }
  //Close elements
  /** @protected */
  _closeTableCell() {
    this.openElements.generateImpliedEndTags(), this.openElements.popUntilTableCellPopped(), this.activeFormattingElements.clearToLastMarker(), this.insertionMode = InsertionMode.IN_ROW;
  }
  /** @protected */
  _closePElement() {
    this.openElements.generateImpliedEndTagsWithExclusion(TAG_ID.P), this.openElements.popUntilTagNamePopped(TAG_ID.P);
  }
  //Insertion modes
  /** @protected */
  _resetInsertionMode() {
    for (let i = this.openElements.stackTop; i >= 0; i--)
      switch (i === 0 && this.fragmentContext ? this.fragmentContextID : this.openElements.tagIDs[i]) {
        case TAG_ID.TR: {
          this.insertionMode = InsertionMode.IN_ROW;
          return;
        }
        case TAG_ID.TBODY:
        case TAG_ID.THEAD:
        case TAG_ID.TFOOT: {
          this.insertionMode = InsertionMode.IN_TABLE_BODY;
          return;
        }
        case TAG_ID.CAPTION: {
          this.insertionMode = InsertionMode.IN_CAPTION;
          return;
        }
        case TAG_ID.COLGROUP: {
          this.insertionMode = InsertionMode.IN_COLUMN_GROUP;
          return;
        }
        case TAG_ID.TABLE: {
          this.insertionMode = InsertionMode.IN_TABLE;
          return;
        }
        case TAG_ID.BODY: {
          this.insertionMode = InsertionMode.IN_BODY;
          return;
        }
        case TAG_ID.FRAMESET: {
          this.insertionMode = InsertionMode.IN_FRAMESET;
          return;
        }
        case TAG_ID.SELECT: {
          this._resetInsertionModeForSelect(i);
          return;
        }
        case TAG_ID.TEMPLATE: {
          this.insertionMode = this.tmplInsertionModeStack[0];
          return;
        }
        case TAG_ID.HTML: {
          this.insertionMode = this.headElement ? InsertionMode.AFTER_HEAD : InsertionMode.BEFORE_HEAD;
          return;
        }
        case TAG_ID.TD:
        case TAG_ID.TH: {
          if (i > 0) {
            this.insertionMode = InsertionMode.IN_CELL;
            return;
          }
          break;
        }
        case TAG_ID.HEAD: {
          if (i > 0) {
            this.insertionMode = InsertionMode.IN_HEAD;
            return;
          }
          break;
        }
      }
    this.insertionMode = InsertionMode.IN_BODY;
  }
  /** @protected */
  _resetInsertionModeForSelect(selectIdx) {
    if (selectIdx > 0)
      for (let i = selectIdx - 1; i > 0; i--) {
        let tn = this.openElements.tagIDs[i];
        if (tn === TAG_ID.TEMPLATE)
          break;
        if (tn === TAG_ID.TABLE) {
          this.insertionMode = InsertionMode.IN_SELECT_IN_TABLE;
          return;
        }
      }
    this.insertionMode = InsertionMode.IN_SELECT;
  }
  //Foster parenting
  /** @protected */
  _isElementCausesFosterParenting(tn) {
    return TABLE_STRUCTURE_TAGS.has(tn);
  }
  /** @protected */
  _shouldFosterParentOnInsertion() {
    return this.fosterParentingEnabled && this.openElements.currentTagId !== void 0 && this._isElementCausesFosterParenting(this.openElements.currentTagId);
  }
  /** @protected */
  _findFosterParentingLocation() {
    for (let i = this.openElements.stackTop; i >= 0; i--) {
      let openElement = this.openElements.items[i];
      switch (this.openElements.tagIDs[i]) {
        case TAG_ID.TEMPLATE: {
          if (this.treeAdapter.getNamespaceURI(openElement) === NS.HTML)
            return { parent: this.treeAdapter.getTemplateContent(openElement), beforeElement: null };
          break;
        }
        case TAG_ID.TABLE: {
          let parent = this.treeAdapter.getParentNode(openElement);
          return parent ? { parent, beforeElement: openElement } : { parent: this.openElements.items[i - 1], beforeElement: null };
        }
        default:
      }
    }
    return { parent: this.openElements.items[0], beforeElement: null };
  }
  /** @protected */
  _fosterParentElement(element) {
    let location = this._findFosterParentingLocation();
    location.beforeElement ? this.treeAdapter.insertBefore(location.parent, element, location.beforeElement) : this.treeAdapter.appendChild(location.parent, element);
  }
  //Special elements
  /** @protected */
  _isSpecialElement(element, id) {
    let ns = this.treeAdapter.getNamespaceURI(element);
    return SPECIAL_ELEMENTS[ns].has(id);
  }
  /** @internal */
  onCharacter(token) {
    if (this.skipNextNewLine = !1, this.tokenizer.inForeignNode) {
      characterInForeignContent(this, token);
      return;
    }
    switch (this.insertionMode) {
      case InsertionMode.INITIAL: {
        tokenInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HTML: {
        tokenBeforeHtml(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD: {
        tokenBeforeHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD: {
        tokenInHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD_NO_SCRIPT: {
        tokenInHeadNoScript(this, token);
        break;
      }
      case InsertionMode.AFTER_HEAD: {
        tokenAfterHead(this, token);
        break;
      }
      case InsertionMode.IN_BODY:
      case InsertionMode.IN_CAPTION:
      case InsertionMode.IN_CELL:
      case InsertionMode.IN_TEMPLATE: {
        characterInBody(this, token);
        break;
      }
      case InsertionMode.TEXT:
      case InsertionMode.IN_SELECT:
      case InsertionMode.IN_SELECT_IN_TABLE: {
        this._insertCharacters(token);
        break;
      }
      case InsertionMode.IN_TABLE:
      case InsertionMode.IN_TABLE_BODY:
      case InsertionMode.IN_ROW: {
        characterInTable(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        characterInTableText(this, token);
        break;
      }
      case InsertionMode.IN_COLUMN_GROUP: {
        tokenInColumnGroup(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY: {
        tokenAfterBody(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_BODY: {
        tokenAfterAfterBody(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onNullCharacter(token) {
    if (this.skipNextNewLine = !1, this.tokenizer.inForeignNode) {
      nullCharacterInForeignContent(this, token);
      return;
    }
    switch (this.insertionMode) {
      case InsertionMode.INITIAL: {
        tokenInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HTML: {
        tokenBeforeHtml(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD: {
        tokenBeforeHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD: {
        tokenInHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD_NO_SCRIPT: {
        tokenInHeadNoScript(this, token);
        break;
      }
      case InsertionMode.AFTER_HEAD: {
        tokenAfterHead(this, token);
        break;
      }
      case InsertionMode.TEXT: {
        this._insertCharacters(token);
        break;
      }
      case InsertionMode.IN_TABLE:
      case InsertionMode.IN_TABLE_BODY:
      case InsertionMode.IN_ROW: {
        characterInTable(this, token);
        break;
      }
      case InsertionMode.IN_COLUMN_GROUP: {
        tokenInColumnGroup(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY: {
        tokenAfterBody(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_BODY: {
        tokenAfterAfterBody(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onComment(token) {
    if (this.skipNextNewLine = !1, this.currentNotInHTML) {
      appendComment(this, token);
      return;
    }
    switch (this.insertionMode) {
      case InsertionMode.INITIAL:
      case InsertionMode.BEFORE_HTML:
      case InsertionMode.BEFORE_HEAD:
      case InsertionMode.IN_HEAD:
      case InsertionMode.IN_HEAD_NO_SCRIPT:
      case InsertionMode.AFTER_HEAD:
      case InsertionMode.IN_BODY:
      case InsertionMode.IN_TABLE:
      case InsertionMode.IN_CAPTION:
      case InsertionMode.IN_COLUMN_GROUP:
      case InsertionMode.IN_TABLE_BODY:
      case InsertionMode.IN_ROW:
      case InsertionMode.IN_CELL:
      case InsertionMode.IN_SELECT:
      case InsertionMode.IN_SELECT_IN_TABLE:
      case InsertionMode.IN_TEMPLATE:
      case InsertionMode.IN_FRAMESET:
      case InsertionMode.AFTER_FRAMESET: {
        appendComment(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        tokenInTableText(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY: {
        appendCommentToRootHtmlElement(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_BODY:
      case InsertionMode.AFTER_AFTER_FRAMESET: {
        appendCommentToDocument(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onDoctype(token) {
    switch (this.skipNextNewLine = !1, this.insertionMode) {
      case InsertionMode.INITIAL: {
        doctypeInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD:
      case InsertionMode.IN_HEAD:
      case InsertionMode.IN_HEAD_NO_SCRIPT:
      case InsertionMode.AFTER_HEAD: {
        this._err(token, ERR.misplacedDoctype);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        tokenInTableText(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onStartTag(token) {
    this.skipNextNewLine = !1, this.currentToken = token, this._processStartTag(token), token.selfClosing && !token.ackSelfClosing && this._err(token, ERR.nonVoidHtmlElementStartTagWithTrailingSolidus);
  }
  /**
   * Processes a given start tag.
   *
   * `onStartTag` checks if a self-closing tag was recognized. When a token
   * is moved inbetween multiple insertion modes, this check for self-closing
   * could lead to false positives. To avoid this, `_processStartTag` is used
   * for nested calls.
   *
   * @param token The token to process.
   * @protected
   */
  _processStartTag(token) {
    this.shouldProcessStartTagTokenInForeignContent(token) ? startTagInForeignContent(this, token) : this._startTagOutsideForeignContent(token);
  }
  /** @protected */
  _startTagOutsideForeignContent(token) {
    switch (this.insertionMode) {
      case InsertionMode.INITIAL: {
        tokenInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HTML: {
        startTagBeforeHtml(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD: {
        startTagBeforeHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD: {
        startTagInHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD_NO_SCRIPT: {
        startTagInHeadNoScript(this, token);
        break;
      }
      case InsertionMode.AFTER_HEAD: {
        startTagAfterHead(this, token);
        break;
      }
      case InsertionMode.IN_BODY: {
        startTagInBody(this, token);
        break;
      }
      case InsertionMode.IN_TABLE: {
        startTagInTable(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        tokenInTableText(this, token);
        break;
      }
      case InsertionMode.IN_CAPTION: {
        startTagInCaption(this, token);
        break;
      }
      case InsertionMode.IN_COLUMN_GROUP: {
        startTagInColumnGroup(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_BODY: {
        startTagInTableBody(this, token);
        break;
      }
      case InsertionMode.IN_ROW: {
        startTagInRow(this, token);
        break;
      }
      case InsertionMode.IN_CELL: {
        startTagInCell(this, token);
        break;
      }
      case InsertionMode.IN_SELECT: {
        startTagInSelect(this, token);
        break;
      }
      case InsertionMode.IN_SELECT_IN_TABLE: {
        startTagInSelectInTable(this, token);
        break;
      }
      case InsertionMode.IN_TEMPLATE: {
        startTagInTemplate(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY: {
        startTagAfterBody(this, token);
        break;
      }
      case InsertionMode.IN_FRAMESET: {
        startTagInFrameset(this, token);
        break;
      }
      case InsertionMode.AFTER_FRAMESET: {
        startTagAfterFrameset(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_BODY: {
        startTagAfterAfterBody(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_FRAMESET: {
        startTagAfterAfterFrameset(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onEndTag(token) {
    this.skipNextNewLine = !1, this.currentToken = token, this.currentNotInHTML ? endTagInForeignContent(this, token) : this._endTagOutsideForeignContent(token);
  }
  /** @protected */
  _endTagOutsideForeignContent(token) {
    switch (this.insertionMode) {
      case InsertionMode.INITIAL: {
        tokenInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HTML: {
        endTagBeforeHtml(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD: {
        endTagBeforeHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD: {
        endTagInHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD_NO_SCRIPT: {
        endTagInHeadNoScript(this, token);
        break;
      }
      case InsertionMode.AFTER_HEAD: {
        endTagAfterHead(this, token);
        break;
      }
      case InsertionMode.IN_BODY: {
        endTagInBody(this, token);
        break;
      }
      case InsertionMode.TEXT: {
        endTagInText(this, token);
        break;
      }
      case InsertionMode.IN_TABLE: {
        endTagInTable(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        tokenInTableText(this, token);
        break;
      }
      case InsertionMode.IN_CAPTION: {
        endTagInCaption(this, token);
        break;
      }
      case InsertionMode.IN_COLUMN_GROUP: {
        endTagInColumnGroup(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_BODY: {
        endTagInTableBody(this, token);
        break;
      }
      case InsertionMode.IN_ROW: {
        endTagInRow(this, token);
        break;
      }
      case InsertionMode.IN_CELL: {
        endTagInCell(this, token);
        break;
      }
      case InsertionMode.IN_SELECT: {
        endTagInSelect(this, token);
        break;
      }
      case InsertionMode.IN_SELECT_IN_TABLE: {
        endTagInSelectInTable(this, token);
        break;
      }
      case InsertionMode.IN_TEMPLATE: {
        endTagInTemplate(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY: {
        endTagAfterBody(this, token);
        break;
      }
      case InsertionMode.IN_FRAMESET: {
        endTagInFrameset(this, token);
        break;
      }
      case InsertionMode.AFTER_FRAMESET: {
        endTagAfterFrameset(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_BODY: {
        tokenAfterAfterBody(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onEof(token) {
    switch (this.insertionMode) {
      case InsertionMode.INITIAL: {
        tokenInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HTML: {
        tokenBeforeHtml(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD: {
        tokenBeforeHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD: {
        tokenInHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD_NO_SCRIPT: {
        tokenInHeadNoScript(this, token);
        break;
      }
      case InsertionMode.AFTER_HEAD: {
        tokenAfterHead(this, token);
        break;
      }
      case InsertionMode.IN_BODY:
      case InsertionMode.IN_TABLE:
      case InsertionMode.IN_CAPTION:
      case InsertionMode.IN_COLUMN_GROUP:
      case InsertionMode.IN_TABLE_BODY:
      case InsertionMode.IN_ROW:
      case InsertionMode.IN_CELL:
      case InsertionMode.IN_SELECT:
      case InsertionMode.IN_SELECT_IN_TABLE: {
        eofInBody(this, token);
        break;
      }
      case InsertionMode.TEXT: {
        eofInText(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        tokenInTableText(this, token);
        break;
      }
      case InsertionMode.IN_TEMPLATE: {
        eofInTemplate(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY:
      case InsertionMode.IN_FRAMESET:
      case InsertionMode.AFTER_FRAMESET:
      case InsertionMode.AFTER_AFTER_BODY:
      case InsertionMode.AFTER_AFTER_FRAMESET: {
        stopParsing(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onWhitespaceCharacter(token) {
    if (this.skipNextNewLine && (this.skipNextNewLine = !1, token.chars.charCodeAt(0) === CODE_POINTS.LINE_FEED)) {
      if (token.chars.length === 1)
        return;
      token.chars = token.chars.substr(1);
    }
    if (this.tokenizer.inForeignNode) {
      this._insertCharacters(token);
      return;
    }
    switch (this.insertionMode) {
      case InsertionMode.IN_HEAD:
      case InsertionMode.IN_HEAD_NO_SCRIPT:
      case InsertionMode.AFTER_HEAD:
      case InsertionMode.TEXT:
      case InsertionMode.IN_COLUMN_GROUP:
      case InsertionMode.IN_SELECT:
      case InsertionMode.IN_SELECT_IN_TABLE:
      case InsertionMode.IN_FRAMESET:
      case InsertionMode.AFTER_FRAMESET: {
        this._insertCharacters(token);
        break;
      }
      case InsertionMode.IN_BODY:
      case InsertionMode.IN_CAPTION:
      case InsertionMode.IN_CELL:
      case InsertionMode.IN_TEMPLATE:
      case InsertionMode.AFTER_BODY:
      case InsertionMode.AFTER_AFTER_BODY:
      case InsertionMode.AFTER_AFTER_FRAMESET: {
        whitespaceCharacterInBody(this, token);
        break;
      }
      case InsertionMode.IN_TABLE:
      case InsertionMode.IN_TABLE_BODY:
      case InsertionMode.IN_ROW: {
        characterInTable(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        whitespaceCharacterInTableText(this, token);
        break;
      }
      default:
    }
  }
};
function aaObtainFormattingElementEntry(p, token) {
  let formattingElementEntry = p.activeFormattingElements.getElementEntryInScopeWithTagName(token.tagName);
  return formattingElementEntry ? p.openElements.contains(formattingElementEntry.element) ? p.openElements.hasInScope(token.tagID) || (formattingElementEntry = null) : (p.activeFormattingElements.removeEntry(formattingElementEntry), formattingElementEntry = null) : genericEndTagInBody(p, token), formattingElementEntry;
}
function aaObtainFurthestBlock(p, formattingElementEntry) {
  let furthestBlock = null, idx = p.openElements.stackTop;
  for (; idx >= 0; idx--) {
    let element = p.openElements.items[idx];
    if (element === formattingElementEntry.element)
      break;
    p._isSpecialElement(element, p.openElements.tagIDs[idx]) && (furthestBlock = element);
  }
  return furthestBlock || (p.openElements.shortenToLength(Math.max(idx, 0)), p.activeFormattingElements.removeEntry(formattingElementEntry)), furthestBlock;
}
function aaInnerLoop(p, furthestBlock, formattingElement) {
  let lastElement = furthestBlock, nextElement = p.openElements.getCommonAncestor(furthestBlock);
  for (let i = 0, element = nextElement; element !== formattingElement; i++, element = nextElement) {
    nextElement = p.openElements.getCommonAncestor(element);
    let elementEntry = p.activeFormattingElements.getElementEntry(element), counterOverflow = elementEntry && i >= AA_INNER_LOOP_ITER;
    !elementEntry || counterOverflow ? (counterOverflow && p.activeFormattingElements.removeEntry(elementEntry), p.openElements.remove(element)) : (element = aaRecreateElementFromEntry(p, elementEntry), lastElement === furthestBlock && (p.activeFormattingElements.bookmark = elementEntry), p.treeAdapter.detachNode(lastElement), p.treeAdapter.appendChild(element, lastElement), lastElement = element);
  }
  return lastElement;
}
function aaRecreateElementFromEntry(p, elementEntry) {
  let ns = p.treeAdapter.getNamespaceURI(elementEntry.element), newElement = p.treeAdapter.createElement(elementEntry.token.tagName, ns, elementEntry.token.attrs);
  return p.openElements.replace(elementEntry.element, newElement), elementEntry.element = newElement, newElement;
}
function aaInsertLastNodeInCommonAncestor(p, commonAncestor, lastElement) {
  let tn = p.treeAdapter.getTagName(commonAncestor), tid = getTagID(tn);
  if (p._isElementCausesFosterParenting(tid))
    p._fosterParentElement(lastElement);
  else {
    let ns = p.treeAdapter.getNamespaceURI(commonAncestor);
    tid === TAG_ID.TEMPLATE && ns === NS.HTML && (commonAncestor = p.treeAdapter.getTemplateContent(commonAncestor)), p.treeAdapter.appendChild(commonAncestor, lastElement);
  }
}
function aaReplaceFormattingElement(p, furthestBlock, formattingElementEntry) {
  let ns = p.treeAdapter.getNamespaceURI(formattingElementEntry.element), { token } = formattingElementEntry, newElement = p.treeAdapter.createElement(token.tagName, ns, token.attrs);
  p._adoptNodes(furthestBlock, newElement), p.treeAdapter.appendChild(furthestBlock, newElement), p.activeFormattingElements.insertElementAfterBookmark(newElement, token), p.activeFormattingElements.removeEntry(formattingElementEntry), p.openElements.remove(formattingElementEntry.element), p.openElements.insertAfter(furthestBlock, newElement, token.tagID);
}
function callAdoptionAgency(p, token) {
  for (let i = 0; i < AA_OUTER_LOOP_ITER; i++) {
    let formattingElementEntry = aaObtainFormattingElementEntry(p, token);
    if (!formattingElementEntry)
      break;
    let furthestBlock = aaObtainFurthestBlock(p, formattingElementEntry);
    if (!furthestBlock)
      break;
    p.activeFormattingElements.bookmark = formattingElementEntry;
    let lastElement = aaInnerLoop(p, furthestBlock, formattingElementEntry.element), commonAncestor = p.openElements.getCommonAncestor(formattingElementEntry.element);
    p.treeAdapter.detachNode(lastElement), commonAncestor && aaInsertLastNodeInCommonAncestor(p, commonAncestor, lastElement), aaReplaceFormattingElement(p, furthestBlock, formattingElementEntry);
  }
}
function appendComment(p, token) {
  p._appendCommentNode(token, p.openElements.currentTmplContentOrNode);
}
function appendCommentToRootHtmlElement(p, token) {
  p._appendCommentNode(token, p.openElements.items[0]);
}
function appendCommentToDocument(p, token) {
  p._appendCommentNode(token, p.document);
}
function stopParsing(p, token) {
  if (p.stopped = !0, token.location) {
    let target = p.fragmentContext ? 0 : 2;
    for (let i = p.openElements.stackTop; i >= target; i--)
      p._setEndLocation(p.openElements.items[i], token);
    if (!p.fragmentContext && p.openElements.stackTop >= 0) {
      let htmlElement = p.openElements.items[0], htmlLocation = p.treeAdapter.getNodeSourceCodeLocation(htmlElement);
      if (htmlLocation && !htmlLocation.endTag && (p._setEndLocation(htmlElement, token), p.openElements.stackTop >= 1)) {
        let bodyElement = p.openElements.items[1], bodyLocation = p.treeAdapter.getNodeSourceCodeLocation(bodyElement);
        bodyLocation && !bodyLocation.endTag && p._setEndLocation(bodyElement, token);
      }
    }
  }
}
function doctypeInInitialMode(p, token) {
  p._setDocumentType(token);
  let mode = token.forceQuirks ? DOCUMENT_MODE.QUIRKS : getDocumentMode(token);
  isConforming(token) || p._err(token, ERR.nonConformingDoctype), p.treeAdapter.setDocumentMode(p.document, mode), p.insertionMode = InsertionMode.BEFORE_HTML;
}
function tokenInInitialMode(p, token) {
  p._err(token, ERR.missingDoctype, !0), p.treeAdapter.setDocumentMode(p.document, DOCUMENT_MODE.QUIRKS), p.insertionMode = InsertionMode.BEFORE_HTML, p._processToken(token);
}
function startTagBeforeHtml(p, token) {
  token.tagID === TAG_ID.HTML ? (p._insertElement(token, NS.HTML), p.insertionMode = InsertionMode.BEFORE_HEAD) : tokenBeforeHtml(p, token);
}
function endTagBeforeHtml(p, token) {
  let tn = token.tagID;
  (tn === TAG_ID.HTML || tn === TAG_ID.HEAD || tn === TAG_ID.BODY || tn === TAG_ID.BR) && tokenBeforeHtml(p, token);
}
function tokenBeforeHtml(p, token) {
  p._insertFakeRootElement(), p.insertionMode = InsertionMode.BEFORE_HEAD, p._processToken(token);
}
function startTagBeforeHead(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.HEAD: {
      p._insertElement(token, NS.HTML), p.headElement = p.openElements.current, p.insertionMode = InsertionMode.IN_HEAD;
      break;
    }
    default:
      tokenBeforeHead(p, token);
  }
}
function endTagBeforeHead(p, token) {
  let tn = token.tagID;
  tn === TAG_ID.HEAD || tn === TAG_ID.BODY || tn === TAG_ID.HTML || tn === TAG_ID.BR ? tokenBeforeHead(p, token) : p._err(token, ERR.endTagWithoutMatchingOpenElement);
}
function tokenBeforeHead(p, token) {
  p._insertFakeElement(TAG_NAMES.HEAD, TAG_ID.HEAD), p.headElement = p.openElements.current, p.insertionMode = InsertionMode.IN_HEAD, p._processToken(token);
}
function startTagInHead(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.BASE:
    case TAG_ID.BASEFONT:
    case TAG_ID.BGSOUND:
    case TAG_ID.LINK:
    case TAG_ID.META: {
      p._appendElement(token, NS.HTML), token.ackSelfClosing = !0;
      break;
    }
    case TAG_ID.TITLE: {
      p._switchToTextParsing(token, TokenizerMode.RCDATA);
      break;
    }
    case TAG_ID.NOSCRIPT: {
      p.options.scriptingEnabled ? p._switchToTextParsing(token, TokenizerMode.RAWTEXT) : (p._insertElement(token, NS.HTML), p.insertionMode = InsertionMode.IN_HEAD_NO_SCRIPT);
      break;
    }
    case TAG_ID.NOFRAMES:
    case TAG_ID.STYLE: {
      p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
      break;
    }
    case TAG_ID.SCRIPT: {
      p._switchToTextParsing(token, TokenizerMode.SCRIPT_DATA);
      break;
    }
    case TAG_ID.TEMPLATE: {
      p._insertTemplate(token), p.activeFormattingElements.insertMarker(), p.framesetOk = !1, p.insertionMode = InsertionMode.IN_TEMPLATE, p.tmplInsertionModeStack.unshift(InsertionMode.IN_TEMPLATE);
      break;
    }
    case TAG_ID.HEAD: {
      p._err(token, ERR.misplacedStartTagForHeadElement);
      break;
    }
    default:
      tokenInHead(p, token);
  }
}
function endTagInHead(p, token) {
  switch (token.tagID) {
    case TAG_ID.HEAD: {
      p.openElements.pop(), p.insertionMode = InsertionMode.AFTER_HEAD;
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.BR:
    case TAG_ID.HTML: {
      tokenInHead(p, token);
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    default:
      p._err(token, ERR.endTagWithoutMatchingOpenElement);
  }
}
function templateEndTagInHead(p, token) {
  p.openElements.tmplCount > 0 ? (p.openElements.generateImpliedEndTagsThoroughly(), p.openElements.currentTagId !== TAG_ID.TEMPLATE && p._err(token, ERR.closingOfElementWithOpenChildElements), p.openElements.popUntilTagNamePopped(TAG_ID.TEMPLATE), p.activeFormattingElements.clearToLastMarker(), p.tmplInsertionModeStack.shift(), p._resetInsertionMode()) : p._err(token, ERR.endTagWithoutMatchingOpenElement);
}
function tokenInHead(p, token) {
  p.openElements.pop(), p.insertionMode = InsertionMode.AFTER_HEAD, p._processToken(token);
}
function startTagInHeadNoScript(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.BASEFONT:
    case TAG_ID.BGSOUND:
    case TAG_ID.HEAD:
    case TAG_ID.LINK:
    case TAG_ID.META:
    case TAG_ID.NOFRAMES:
    case TAG_ID.STYLE: {
      startTagInHead(p, token);
      break;
    }
    case TAG_ID.NOSCRIPT: {
      p._err(token, ERR.nestedNoscriptInHead);
      break;
    }
    default:
      tokenInHeadNoScript(p, token);
  }
}
function endTagInHeadNoScript(p, token) {
  switch (token.tagID) {
    case TAG_ID.NOSCRIPT: {
      p.openElements.pop(), p.insertionMode = InsertionMode.IN_HEAD;
      break;
    }
    case TAG_ID.BR: {
      tokenInHeadNoScript(p, token);
      break;
    }
    default:
      p._err(token, ERR.endTagWithoutMatchingOpenElement);
  }
}
function tokenInHeadNoScript(p, token) {
  let errCode = token.type === TokenType.EOF ? ERR.openElementsLeftAfterEof : ERR.disallowedContentInNoscriptInHead;
  p._err(token, errCode), p.openElements.pop(), p.insertionMode = InsertionMode.IN_HEAD, p._processToken(token);
}
function startTagAfterHead(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.BODY: {
      p._insertElement(token, NS.HTML), p.framesetOk = !1, p.insertionMode = InsertionMode.IN_BODY;
      break;
    }
    case TAG_ID.FRAMESET: {
      p._insertElement(token, NS.HTML), p.insertionMode = InsertionMode.IN_FRAMESET;
      break;
    }
    case TAG_ID.BASE:
    case TAG_ID.BASEFONT:
    case TAG_ID.BGSOUND:
    case TAG_ID.LINK:
    case TAG_ID.META:
    case TAG_ID.NOFRAMES:
    case TAG_ID.SCRIPT:
    case TAG_ID.STYLE:
    case TAG_ID.TEMPLATE:
    case TAG_ID.TITLE: {
      p._err(token, ERR.abandonedHeadElementChild), p.openElements.push(p.headElement, TAG_ID.HEAD), startTagInHead(p, token), p.openElements.remove(p.headElement);
      break;
    }
    case TAG_ID.HEAD: {
      p._err(token, ERR.misplacedStartTagForHeadElement);
      break;
    }
    default:
      tokenAfterHead(p, token);
  }
}
function endTagAfterHead(p, token) {
  switch (token.tagID) {
    case TAG_ID.BODY:
    case TAG_ID.HTML:
    case TAG_ID.BR: {
      tokenAfterHead(p, token);
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    default:
      p._err(token, ERR.endTagWithoutMatchingOpenElement);
  }
}
function tokenAfterHead(p, token) {
  p._insertFakeElement(TAG_NAMES.BODY, TAG_ID.BODY), p.insertionMode = InsertionMode.IN_BODY, modeInBody(p, token);
}
function modeInBody(p, token) {
  switch (token.type) {
    case TokenType.CHARACTER: {
      characterInBody(p, token);
      break;
    }
    case TokenType.WHITESPACE_CHARACTER: {
      whitespaceCharacterInBody(p, token);
      break;
    }
    case TokenType.COMMENT: {
      appendComment(p, token);
      break;
    }
    case TokenType.START_TAG: {
      startTagInBody(p, token);
      break;
    }
    case TokenType.END_TAG: {
      endTagInBody(p, token);
      break;
    }
    case TokenType.EOF: {
      eofInBody(p, token);
      break;
    }
    default:
  }
}
function whitespaceCharacterInBody(p, token) {
  p._reconstructActiveFormattingElements(), p._insertCharacters(token);
}
function characterInBody(p, token) {
  p._reconstructActiveFormattingElements(), p._insertCharacters(token), p.framesetOk = !1;
}
function htmlStartTagInBody(p, token) {
  p.openElements.tmplCount === 0 && p.treeAdapter.adoptAttributes(p.openElements.items[0], token.attrs);
}
function bodyStartTagInBody(p, token) {
  let bodyElement = p.openElements.tryPeekProperlyNestedBodyElement();
  bodyElement && p.openElements.tmplCount === 0 && (p.framesetOk = !1, p.treeAdapter.adoptAttributes(bodyElement, token.attrs));
}
function framesetStartTagInBody(p, token) {
  let bodyElement = p.openElements.tryPeekProperlyNestedBodyElement();
  p.framesetOk && bodyElement && (p.treeAdapter.detachNode(bodyElement), p.openElements.popAllUpToHtmlElement(), p._insertElement(token, NS.HTML), p.insertionMode = InsertionMode.IN_FRAMESET);
}
function addressStartTagInBody(p, token) {
  p.openElements.hasInButtonScope(TAG_ID.P) && p._closePElement(), p._insertElement(token, NS.HTML);
}
function numberedHeaderStartTagInBody(p, token) {
  p.openElements.hasInButtonScope(TAG_ID.P) && p._closePElement(), p.openElements.currentTagId !== void 0 && NUMBERED_HEADERS.has(p.openElements.currentTagId) && p.openElements.pop(), p._insertElement(token, NS.HTML);
}
function preStartTagInBody(p, token) {
  p.openElements.hasInButtonScope(TAG_ID.P) && p._closePElement(), p._insertElement(token, NS.HTML), p.skipNextNewLine = !0, p.framesetOk = !1;
}
function formStartTagInBody(p, token) {
  let inTemplate = p.openElements.tmplCount > 0;
  (!p.formElement || inTemplate) && (p.openElements.hasInButtonScope(TAG_ID.P) && p._closePElement(), p._insertElement(token, NS.HTML), inTemplate || (p.formElement = p.openElements.current));
}
function listItemStartTagInBody(p, token) {
  p.framesetOk = !1;
  let tn = token.tagID;
  for (let i = p.openElements.stackTop; i >= 0; i--) {
    let elementId = p.openElements.tagIDs[i];
    if (tn === TAG_ID.LI && elementId === TAG_ID.LI || (tn === TAG_ID.DD || tn === TAG_ID.DT) && (elementId === TAG_ID.DD || elementId === TAG_ID.DT)) {
      p.openElements.generateImpliedEndTagsWithExclusion(elementId), p.openElements.popUntilTagNamePopped(elementId);
      break;
    }
    if (elementId !== TAG_ID.ADDRESS && elementId !== TAG_ID.DIV && elementId !== TAG_ID.P && p._isSpecialElement(p.openElements.items[i], elementId))
      break;
  }
  p.openElements.hasInButtonScope(TAG_ID.P) && p._closePElement(), p._insertElement(token, NS.HTML);
}
function plaintextStartTagInBody(p, token) {
  p.openElements.hasInButtonScope(TAG_ID.P) && p._closePElement(), p._insertElement(token, NS.HTML), p.tokenizer.state = TokenizerMode.PLAINTEXT;
}
function buttonStartTagInBody(p, token) {
  p.openElements.hasInScope(TAG_ID.BUTTON) && (p.openElements.generateImpliedEndTags(), p.openElements.popUntilTagNamePopped(TAG_ID.BUTTON)), p._reconstructActiveFormattingElements(), p._insertElement(token, NS.HTML), p.framesetOk = !1;
}
function aStartTagInBody(p, token) {
  let activeElementEntry = p.activeFormattingElements.getElementEntryInScopeWithTagName(TAG_NAMES.A);
  activeElementEntry && (callAdoptionAgency(p, token), p.openElements.remove(activeElementEntry.element), p.activeFormattingElements.removeEntry(activeElementEntry)), p._reconstructActiveFormattingElements(), p._insertElement(token, NS.HTML), p.activeFormattingElements.pushElement(p.openElements.current, token);
}
function bStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements(), p._insertElement(token, NS.HTML), p.activeFormattingElements.pushElement(p.openElements.current, token);
}
function nobrStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements(), p.openElements.hasInScope(TAG_ID.NOBR) && (callAdoptionAgency(p, token), p._reconstructActiveFormattingElements()), p._insertElement(token, NS.HTML), p.activeFormattingElements.pushElement(p.openElements.current, token);
}
function appletStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements(), p._insertElement(token, NS.HTML), p.activeFormattingElements.insertMarker(), p.framesetOk = !1;
}
function tableStartTagInBody(p, token) {
  p.treeAdapter.getDocumentMode(p.document) !== DOCUMENT_MODE.QUIRKS && p.openElements.hasInButtonScope(TAG_ID.P) && p._closePElement(), p._insertElement(token, NS.HTML), p.framesetOk = !1, p.insertionMode = InsertionMode.IN_TABLE;
}
function areaStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements(), p._appendElement(token, NS.HTML), p.framesetOk = !1, token.ackSelfClosing = !0;
}
function isHiddenInput(token) {
  let inputType = getTokenAttr(token, ATTRS.TYPE);
  return inputType != null && inputType.toLowerCase() === HIDDEN_INPUT_TYPE;
}
function inputStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements(), p._appendElement(token, NS.HTML), isHiddenInput(token) || (p.framesetOk = !1), token.ackSelfClosing = !0;
}
function paramStartTagInBody(p, token) {
  p._appendElement(token, NS.HTML), token.ackSelfClosing = !0;
}
function hrStartTagInBody(p, token) {
  p.openElements.hasInButtonScope(TAG_ID.P) && p._closePElement(), p._appendElement(token, NS.HTML), p.framesetOk = !1, token.ackSelfClosing = !0;
}
function imageStartTagInBody(p, token) {
  token.tagName = TAG_NAMES.IMG, token.tagID = TAG_ID.IMG, areaStartTagInBody(p, token);
}
function textareaStartTagInBody(p, token) {
  p._insertElement(token, NS.HTML), p.skipNextNewLine = !0, p.tokenizer.state = TokenizerMode.RCDATA, p.originalInsertionMode = p.insertionMode, p.framesetOk = !1, p.insertionMode = InsertionMode.TEXT;
}
function xmpStartTagInBody(p, token) {
  p.openElements.hasInButtonScope(TAG_ID.P) && p._closePElement(), p._reconstructActiveFormattingElements(), p.framesetOk = !1, p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
}
function iframeStartTagInBody(p, token) {
  p.framesetOk = !1, p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
}
function rawTextStartTagInBody(p, token) {
  p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
}
function selectStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements(), p._insertElement(token, NS.HTML), p.framesetOk = !1, p.insertionMode = p.insertionMode === InsertionMode.IN_TABLE || p.insertionMode === InsertionMode.IN_CAPTION || p.insertionMode === InsertionMode.IN_TABLE_BODY || p.insertionMode === InsertionMode.IN_ROW || p.insertionMode === InsertionMode.IN_CELL ? InsertionMode.IN_SELECT_IN_TABLE : InsertionMode.IN_SELECT;
}
function optgroupStartTagInBody(p, token) {
  p.openElements.currentTagId === TAG_ID.OPTION && p.openElements.pop(), p._reconstructActiveFormattingElements(), p._insertElement(token, NS.HTML);
}
function rbStartTagInBody(p, token) {
  p.openElements.hasInScope(TAG_ID.RUBY) && p.openElements.generateImpliedEndTags(), p._insertElement(token, NS.HTML);
}
function rtStartTagInBody(p, token) {
  p.openElements.hasInScope(TAG_ID.RUBY) && p.openElements.generateImpliedEndTagsWithExclusion(TAG_ID.RTC), p._insertElement(token, NS.HTML);
}
function mathStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements(), adjustTokenMathMLAttrs(token), adjustTokenXMLAttrs(token), token.selfClosing ? p._appendElement(token, NS.MATHML) : p._insertElement(token, NS.MATHML), token.ackSelfClosing = !0;
}
function svgStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements(), adjustTokenSVGAttrs(token), adjustTokenXMLAttrs(token), token.selfClosing ? p._appendElement(token, NS.SVG) : p._insertElement(token, NS.SVG), token.ackSelfClosing = !0;
}
function genericStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements(), p._insertElement(token, NS.HTML);
}
function startTagInBody(p, token) {
  switch (token.tagID) {
    case TAG_ID.I:
    case TAG_ID.S:
    case TAG_ID.B:
    case TAG_ID.U:
    case TAG_ID.EM:
    case TAG_ID.TT:
    case TAG_ID.BIG:
    case TAG_ID.CODE:
    case TAG_ID.FONT:
    case TAG_ID.SMALL:
    case TAG_ID.STRIKE:
    case TAG_ID.STRONG: {
      bStartTagInBody(p, token);
      break;
    }
    case TAG_ID.A: {
      aStartTagInBody(p, token);
      break;
    }
    case TAG_ID.H1:
    case TAG_ID.H2:
    case TAG_ID.H3:
    case TAG_ID.H4:
    case TAG_ID.H5:
    case TAG_ID.H6: {
      numberedHeaderStartTagInBody(p, token);
      break;
    }
    case TAG_ID.P:
    case TAG_ID.DL:
    case TAG_ID.OL:
    case TAG_ID.UL:
    case TAG_ID.DIV:
    case TAG_ID.DIR:
    case TAG_ID.NAV:
    case TAG_ID.MAIN:
    case TAG_ID.MENU:
    case TAG_ID.ASIDE:
    case TAG_ID.CENTER:
    case TAG_ID.FIGURE:
    case TAG_ID.FOOTER:
    case TAG_ID.HEADER:
    case TAG_ID.HGROUP:
    case TAG_ID.DIALOG:
    case TAG_ID.DETAILS:
    case TAG_ID.ADDRESS:
    case TAG_ID.ARTICLE:
    case TAG_ID.SEARCH:
    case TAG_ID.SECTION:
    case TAG_ID.SUMMARY:
    case TAG_ID.FIELDSET:
    case TAG_ID.BLOCKQUOTE:
    case TAG_ID.FIGCAPTION: {
      addressStartTagInBody(p, token);
      break;
    }
    case TAG_ID.LI:
    case TAG_ID.DD:
    case TAG_ID.DT: {
      listItemStartTagInBody(p, token);
      break;
    }
    case TAG_ID.BR:
    case TAG_ID.IMG:
    case TAG_ID.WBR:
    case TAG_ID.AREA:
    case TAG_ID.EMBED:
    case TAG_ID.KEYGEN: {
      areaStartTagInBody(p, token);
      break;
    }
    case TAG_ID.HR: {
      hrStartTagInBody(p, token);
      break;
    }
    case TAG_ID.RB:
    case TAG_ID.RTC: {
      rbStartTagInBody(p, token);
      break;
    }
    case TAG_ID.RT:
    case TAG_ID.RP: {
      rtStartTagInBody(p, token);
      break;
    }
    case TAG_ID.PRE:
    case TAG_ID.LISTING: {
      preStartTagInBody(p, token);
      break;
    }
    case TAG_ID.XMP: {
      xmpStartTagInBody(p, token);
      break;
    }
    case TAG_ID.SVG: {
      svgStartTagInBody(p, token);
      break;
    }
    case TAG_ID.HTML: {
      htmlStartTagInBody(p, token);
      break;
    }
    case TAG_ID.BASE:
    case TAG_ID.LINK:
    case TAG_ID.META:
    case TAG_ID.STYLE:
    case TAG_ID.TITLE:
    case TAG_ID.SCRIPT:
    case TAG_ID.BGSOUND:
    case TAG_ID.BASEFONT:
    case TAG_ID.TEMPLATE: {
      startTagInHead(p, token);
      break;
    }
    case TAG_ID.BODY: {
      bodyStartTagInBody(p, token);
      break;
    }
    case TAG_ID.FORM: {
      formStartTagInBody(p, token);
      break;
    }
    case TAG_ID.NOBR: {
      nobrStartTagInBody(p, token);
      break;
    }
    case TAG_ID.MATH: {
      mathStartTagInBody(p, token);
      break;
    }
    case TAG_ID.TABLE: {
      tableStartTagInBody(p, token);
      break;
    }
    case TAG_ID.INPUT: {
      inputStartTagInBody(p, token);
      break;
    }
    case TAG_ID.PARAM:
    case TAG_ID.TRACK:
    case TAG_ID.SOURCE: {
      paramStartTagInBody(p, token);
      break;
    }
    case TAG_ID.IMAGE: {
      imageStartTagInBody(p, token);
      break;
    }
    case TAG_ID.BUTTON: {
      buttonStartTagInBody(p, token);
      break;
    }
    case TAG_ID.APPLET:
    case TAG_ID.OBJECT:
    case TAG_ID.MARQUEE: {
      appletStartTagInBody(p, token);
      break;
    }
    case TAG_ID.IFRAME: {
      iframeStartTagInBody(p, token);
      break;
    }
    case TAG_ID.SELECT: {
      selectStartTagInBody(p, token);
      break;
    }
    case TAG_ID.OPTION:
    case TAG_ID.OPTGROUP: {
      optgroupStartTagInBody(p, token);
      break;
    }
    case TAG_ID.NOEMBED:
    case TAG_ID.NOFRAMES: {
      rawTextStartTagInBody(p, token);
      break;
    }
    case TAG_ID.FRAMESET: {
      framesetStartTagInBody(p, token);
      break;
    }
    case TAG_ID.TEXTAREA: {
      textareaStartTagInBody(p, token);
      break;
    }
    case TAG_ID.NOSCRIPT: {
      p.options.scriptingEnabled ? rawTextStartTagInBody(p, token) : genericStartTagInBody(p, token);
      break;
    }
    case TAG_ID.PLAINTEXT: {
      plaintextStartTagInBody(p, token);
      break;
    }
    case TAG_ID.COL:
    case TAG_ID.TH:
    case TAG_ID.TD:
    case TAG_ID.TR:
    case TAG_ID.HEAD:
    case TAG_ID.FRAME:
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD:
    case TAG_ID.CAPTION:
    case TAG_ID.COLGROUP:
      break;
    default:
      genericStartTagInBody(p, token);
  }
}
function bodyEndTagInBody(p, token) {
  if (p.openElements.hasInScope(TAG_ID.BODY) && (p.insertionMode = InsertionMode.AFTER_BODY, p.options.sourceCodeLocationInfo)) {
    let bodyElement = p.openElements.tryPeekProperlyNestedBodyElement();
    bodyElement && p._setEndLocation(bodyElement, token);
  }
}
function htmlEndTagInBody(p, token) {
  p.openElements.hasInScope(TAG_ID.BODY) && (p.insertionMode = InsertionMode.AFTER_BODY, endTagAfterBody(p, token));
}
function addressEndTagInBody(p, token) {
  let tn = token.tagID;
  p.openElements.hasInScope(tn) && (p.openElements.generateImpliedEndTags(), p.openElements.popUntilTagNamePopped(tn));
}
function formEndTagInBody(p) {
  let inTemplate = p.openElements.tmplCount > 0, { formElement } = p;
  inTemplate || (p.formElement = null), (formElement || inTemplate) && p.openElements.hasInScope(TAG_ID.FORM) && (p.openElements.generateImpliedEndTags(), inTemplate ? p.openElements.popUntilTagNamePopped(TAG_ID.FORM) : formElement && p.openElements.remove(formElement));
}
function pEndTagInBody(p) {
  p.openElements.hasInButtonScope(TAG_ID.P) || p._insertFakeElement(TAG_NAMES.P, TAG_ID.P), p._closePElement();
}
function liEndTagInBody(p) {
  p.openElements.hasInListItemScope(TAG_ID.LI) && (p.openElements.generateImpliedEndTagsWithExclusion(TAG_ID.LI), p.openElements.popUntilTagNamePopped(TAG_ID.LI));
}
function ddEndTagInBody(p, token) {
  let tn = token.tagID;
  p.openElements.hasInScope(tn) && (p.openElements.generateImpliedEndTagsWithExclusion(tn), p.openElements.popUntilTagNamePopped(tn));
}
function numberedHeaderEndTagInBody(p) {
  p.openElements.hasNumberedHeaderInScope() && (p.openElements.generateImpliedEndTags(), p.openElements.popUntilNumberedHeaderPopped());
}
function appletEndTagInBody(p, token) {
  let tn = token.tagID;
  p.openElements.hasInScope(tn) && (p.openElements.generateImpliedEndTags(), p.openElements.popUntilTagNamePopped(tn), p.activeFormattingElements.clearToLastMarker());
}
function brEndTagInBody(p) {
  p._reconstructActiveFormattingElements(), p._insertFakeElement(TAG_NAMES.BR, TAG_ID.BR), p.openElements.pop(), p.framesetOk = !1;
}
function genericEndTagInBody(p, token) {
  let tn = token.tagName, tid = token.tagID;
  for (let i = p.openElements.stackTop; i > 0; i--) {
    let element = p.openElements.items[i], elementId = p.openElements.tagIDs[i];
    if (tid === elementId && (tid !== TAG_ID.UNKNOWN || p.treeAdapter.getTagName(element) === tn)) {
      p.openElements.generateImpliedEndTagsWithExclusion(tid), p.openElements.stackTop >= i && p.openElements.shortenToLength(i);
      break;
    }
    if (p._isSpecialElement(element, elementId))
      break;
  }
}
function endTagInBody(p, token) {
  switch (token.tagID) {
    case TAG_ID.A:
    case TAG_ID.B:
    case TAG_ID.I:
    case TAG_ID.S:
    case TAG_ID.U:
    case TAG_ID.EM:
    case TAG_ID.TT:
    case TAG_ID.BIG:
    case TAG_ID.CODE:
    case TAG_ID.FONT:
    case TAG_ID.NOBR:
    case TAG_ID.SMALL:
    case TAG_ID.STRIKE:
    case TAG_ID.STRONG: {
      callAdoptionAgency(p, token);
      break;
    }
    case TAG_ID.P: {
      pEndTagInBody(p);
      break;
    }
    case TAG_ID.DL:
    case TAG_ID.UL:
    case TAG_ID.OL:
    case TAG_ID.DIR:
    case TAG_ID.DIV:
    case TAG_ID.NAV:
    case TAG_ID.PRE:
    case TAG_ID.MAIN:
    case TAG_ID.MENU:
    case TAG_ID.ASIDE:
    case TAG_ID.BUTTON:
    case TAG_ID.CENTER:
    case TAG_ID.FIGURE:
    case TAG_ID.FOOTER:
    case TAG_ID.HEADER:
    case TAG_ID.HGROUP:
    case TAG_ID.DIALOG:
    case TAG_ID.ADDRESS:
    case TAG_ID.ARTICLE:
    case TAG_ID.DETAILS:
    case TAG_ID.SEARCH:
    case TAG_ID.SECTION:
    case TAG_ID.SUMMARY:
    case TAG_ID.LISTING:
    case TAG_ID.FIELDSET:
    case TAG_ID.BLOCKQUOTE:
    case TAG_ID.FIGCAPTION: {
      addressEndTagInBody(p, token);
      break;
    }
    case TAG_ID.LI: {
      liEndTagInBody(p);
      break;
    }
    case TAG_ID.DD:
    case TAG_ID.DT: {
      ddEndTagInBody(p, token);
      break;
    }
    case TAG_ID.H1:
    case TAG_ID.H2:
    case TAG_ID.H3:
    case TAG_ID.H4:
    case TAG_ID.H5:
    case TAG_ID.H6: {
      numberedHeaderEndTagInBody(p);
      break;
    }
    case TAG_ID.BR: {
      brEndTagInBody(p);
      break;
    }
    case TAG_ID.BODY: {
      bodyEndTagInBody(p, token);
      break;
    }
    case TAG_ID.HTML: {
      htmlEndTagInBody(p, token);
      break;
    }
    case TAG_ID.FORM: {
      formEndTagInBody(p);
      break;
    }
    case TAG_ID.APPLET:
    case TAG_ID.OBJECT:
    case TAG_ID.MARQUEE: {
      appletEndTagInBody(p, token);
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    default:
      genericEndTagInBody(p, token);
  }
}
function eofInBody(p, token) {
  p.tmplInsertionModeStack.length > 0 ? eofInTemplate(p, token) : stopParsing(p, token);
}
function endTagInText(p, token) {
  var _a;
  token.tagID === TAG_ID.SCRIPT && ((_a = p.scriptHandler) === null || _a === void 0 || _a.call(p, p.openElements.current)), p.openElements.pop(), p.insertionMode = p.originalInsertionMode;
}
function eofInText(p, token) {
  p._err(token, ERR.eofInElementThatCanContainOnlyText), p.openElements.pop(), p.insertionMode = p.originalInsertionMode, p.onEof(token);
}
function characterInTable(p, token) {
  if (p.openElements.currentTagId !== void 0 && TABLE_STRUCTURE_TAGS.has(p.openElements.currentTagId))
    switch (p.pendingCharacterTokens.length = 0, p.hasNonWhitespacePendingCharacterToken = !1, p.originalInsertionMode = p.insertionMode, p.insertionMode = InsertionMode.IN_TABLE_TEXT, token.type) {
      case TokenType.CHARACTER: {
        characterInTableText(p, token);
        break;
      }
      case TokenType.WHITESPACE_CHARACTER: {
        whitespaceCharacterInTableText(p, token);
        break;
      }
    }
  else
    tokenInTable(p, token);
}
function captionStartTagInTable(p, token) {
  p.openElements.clearBackToTableContext(), p.activeFormattingElements.insertMarker(), p._insertElement(token, NS.HTML), p.insertionMode = InsertionMode.IN_CAPTION;
}
function colgroupStartTagInTable(p, token) {
  p.openElements.clearBackToTableContext(), p._insertElement(token, NS.HTML), p.insertionMode = InsertionMode.IN_COLUMN_GROUP;
}
function colStartTagInTable(p, token) {
  p.openElements.clearBackToTableContext(), p._insertFakeElement(TAG_NAMES.COLGROUP, TAG_ID.COLGROUP), p.insertionMode = InsertionMode.IN_COLUMN_GROUP, startTagInColumnGroup(p, token);
}
function tbodyStartTagInTable(p, token) {
  p.openElements.clearBackToTableContext(), p._insertElement(token, NS.HTML), p.insertionMode = InsertionMode.IN_TABLE_BODY;
}
function tdStartTagInTable(p, token) {
  p.openElements.clearBackToTableContext(), p._insertFakeElement(TAG_NAMES.TBODY, TAG_ID.TBODY), p.insertionMode = InsertionMode.IN_TABLE_BODY, startTagInTableBody(p, token);
}
function tableStartTagInTable(p, token) {
  p.openElements.hasInTableScope(TAG_ID.TABLE) && (p.openElements.popUntilTagNamePopped(TAG_ID.TABLE), p._resetInsertionMode(), p._processStartTag(token));
}
function inputStartTagInTable(p, token) {
  isHiddenInput(token) ? p._appendElement(token, NS.HTML) : tokenInTable(p, token), token.ackSelfClosing = !0;
}
function formStartTagInTable(p, token) {
  !p.formElement && p.openElements.tmplCount === 0 && (p._insertElement(token, NS.HTML), p.formElement = p.openElements.current, p.openElements.pop());
}
function startTagInTable(p, token) {
  switch (token.tagID) {
    case TAG_ID.TD:
    case TAG_ID.TH:
    case TAG_ID.TR: {
      tdStartTagInTable(p, token);
      break;
    }
    case TAG_ID.STYLE:
    case TAG_ID.SCRIPT:
    case TAG_ID.TEMPLATE: {
      startTagInHead(p, token);
      break;
    }
    case TAG_ID.COL: {
      colStartTagInTable(p, token);
      break;
    }
    case TAG_ID.FORM: {
      formStartTagInTable(p, token);
      break;
    }
    case TAG_ID.TABLE: {
      tableStartTagInTable(p, token);
      break;
    }
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD: {
      tbodyStartTagInTable(p, token);
      break;
    }
    case TAG_ID.INPUT: {
      inputStartTagInTable(p, token);
      break;
    }
    case TAG_ID.CAPTION: {
      captionStartTagInTable(p, token);
      break;
    }
    case TAG_ID.COLGROUP: {
      colgroupStartTagInTable(p, token);
      break;
    }
    default:
      tokenInTable(p, token);
  }
}
function endTagInTable(p, token) {
  switch (token.tagID) {
    case TAG_ID.TABLE: {
      p.openElements.hasInTableScope(TAG_ID.TABLE) && (p.openElements.popUntilTagNamePopped(TAG_ID.TABLE), p._resetInsertionMode());
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.HTML:
    case TAG_ID.TBODY:
    case TAG_ID.TD:
    case TAG_ID.TFOOT:
    case TAG_ID.TH:
    case TAG_ID.THEAD:
    case TAG_ID.TR:
      break;
    default:
      tokenInTable(p, token);
  }
}
function tokenInTable(p, token) {
  let savedFosterParentingState = p.fosterParentingEnabled;
  p.fosterParentingEnabled = !0, modeInBody(p, token), p.fosterParentingEnabled = savedFosterParentingState;
}
function whitespaceCharacterInTableText(p, token) {
  p.pendingCharacterTokens.push(token);
}
function characterInTableText(p, token) {
  p.pendingCharacterTokens.push(token), p.hasNonWhitespacePendingCharacterToken = !0;
}
function tokenInTableText(p, token) {
  let i = 0;
  if (p.hasNonWhitespacePendingCharacterToken)
    for (; i < p.pendingCharacterTokens.length; i++)
      tokenInTable(p, p.pendingCharacterTokens[i]);
  else
    for (; i < p.pendingCharacterTokens.length; i++)
      p._insertCharacters(p.pendingCharacterTokens[i]);
  p.insertionMode = p.originalInsertionMode, p._processToken(token);
}
var TABLE_VOID_ELEMENTS = /* @__PURE__ */ new Set([TAG_ID.CAPTION, TAG_ID.COL, TAG_ID.COLGROUP, TAG_ID.TBODY, TAG_ID.TD, TAG_ID.TFOOT, TAG_ID.TH, TAG_ID.THEAD, TAG_ID.TR]);
function startTagInCaption(p, token) {
  let tn = token.tagID;
  TABLE_VOID_ELEMENTS.has(tn) ? p.openElements.hasInTableScope(TAG_ID.CAPTION) && (p.openElements.generateImpliedEndTags(), p.openElements.popUntilTagNamePopped(TAG_ID.CAPTION), p.activeFormattingElements.clearToLastMarker(), p.insertionMode = InsertionMode.IN_TABLE, startTagInTable(p, token)) : startTagInBody(p, token);
}
function endTagInCaption(p, token) {
  let tn = token.tagID;
  switch (tn) {
    case TAG_ID.CAPTION:
    case TAG_ID.TABLE: {
      p.openElements.hasInTableScope(TAG_ID.CAPTION) && (p.openElements.generateImpliedEndTags(), p.openElements.popUntilTagNamePopped(TAG_ID.CAPTION), p.activeFormattingElements.clearToLastMarker(), p.insertionMode = InsertionMode.IN_TABLE, tn === TAG_ID.TABLE && endTagInTable(p, token));
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.HTML:
    case TAG_ID.TBODY:
    case TAG_ID.TD:
    case TAG_ID.TFOOT:
    case TAG_ID.TH:
    case TAG_ID.THEAD:
    case TAG_ID.TR:
      break;
    default:
      endTagInBody(p, token);
  }
}
function startTagInColumnGroup(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.COL: {
      p._appendElement(token, NS.HTML), token.ackSelfClosing = !0;
      break;
    }
    case TAG_ID.TEMPLATE: {
      startTagInHead(p, token);
      break;
    }
    default:
      tokenInColumnGroup(p, token);
  }
}
function endTagInColumnGroup(p, token) {
  switch (token.tagID) {
    case TAG_ID.COLGROUP: {
      p.openElements.currentTagId === TAG_ID.COLGROUP && (p.openElements.pop(), p.insertionMode = InsertionMode.IN_TABLE);
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    case TAG_ID.COL:
      break;
    default:
      tokenInColumnGroup(p, token);
  }
}
function tokenInColumnGroup(p, token) {
  p.openElements.currentTagId === TAG_ID.COLGROUP && (p.openElements.pop(), p.insertionMode = InsertionMode.IN_TABLE, p._processToken(token));
}
function startTagInTableBody(p, token) {
  switch (token.tagID) {
    case TAG_ID.TR: {
      p.openElements.clearBackToTableBodyContext(), p._insertElement(token, NS.HTML), p.insertionMode = InsertionMode.IN_ROW;
      break;
    }
    case TAG_ID.TH:
    case TAG_ID.TD: {
      p.openElements.clearBackToTableBodyContext(), p._insertFakeElement(TAG_NAMES.TR, TAG_ID.TR), p.insertionMode = InsertionMode.IN_ROW, startTagInRow(p, token);
      break;
    }
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD: {
      p.openElements.hasTableBodyContextInTableScope() && (p.openElements.clearBackToTableBodyContext(), p.openElements.pop(), p.insertionMode = InsertionMode.IN_TABLE, startTagInTable(p, token));
      break;
    }
    default:
      startTagInTable(p, token);
  }
}
function endTagInTableBody(p, token) {
  let tn = token.tagID;
  switch (token.tagID) {
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD: {
      p.openElements.hasInTableScope(tn) && (p.openElements.clearBackToTableBodyContext(), p.openElements.pop(), p.insertionMode = InsertionMode.IN_TABLE);
      break;
    }
    case TAG_ID.TABLE: {
      p.openElements.hasTableBodyContextInTableScope() && (p.openElements.clearBackToTableBodyContext(), p.openElements.pop(), p.insertionMode = InsertionMode.IN_TABLE, endTagInTable(p, token));
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.HTML:
    case TAG_ID.TD:
    case TAG_ID.TH:
    case TAG_ID.TR:
      break;
    default:
      endTagInTable(p, token);
  }
}
function startTagInRow(p, token) {
  switch (token.tagID) {
    case TAG_ID.TH:
    case TAG_ID.TD: {
      p.openElements.clearBackToTableRowContext(), p._insertElement(token, NS.HTML), p.insertionMode = InsertionMode.IN_CELL, p.activeFormattingElements.insertMarker();
      break;
    }
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD:
    case TAG_ID.TR: {
      p.openElements.hasInTableScope(TAG_ID.TR) && (p.openElements.clearBackToTableRowContext(), p.openElements.pop(), p.insertionMode = InsertionMode.IN_TABLE_BODY, startTagInTableBody(p, token));
      break;
    }
    default:
      startTagInTable(p, token);
  }
}
function endTagInRow(p, token) {
  switch (token.tagID) {
    case TAG_ID.TR: {
      p.openElements.hasInTableScope(TAG_ID.TR) && (p.openElements.clearBackToTableRowContext(), p.openElements.pop(), p.insertionMode = InsertionMode.IN_TABLE_BODY);
      break;
    }
    case TAG_ID.TABLE: {
      p.openElements.hasInTableScope(TAG_ID.TR) && (p.openElements.clearBackToTableRowContext(), p.openElements.pop(), p.insertionMode = InsertionMode.IN_TABLE_BODY, endTagInTableBody(p, token));
      break;
    }
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD: {
      (p.openElements.hasInTableScope(token.tagID) || p.openElements.hasInTableScope(TAG_ID.TR)) && (p.openElements.clearBackToTableRowContext(), p.openElements.pop(), p.insertionMode = InsertionMode.IN_TABLE_BODY, endTagInTableBody(p, token));
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.HTML:
    case TAG_ID.TD:
    case TAG_ID.TH:
      break;
    default:
      endTagInTable(p, token);
  }
}
function startTagInCell(p, token) {
  let tn = token.tagID;
  TABLE_VOID_ELEMENTS.has(tn) ? (p.openElements.hasInTableScope(TAG_ID.TD) || p.openElements.hasInTableScope(TAG_ID.TH)) && (p._closeTableCell(), startTagInRow(p, token)) : startTagInBody(p, token);
}
function endTagInCell(p, token) {
  let tn = token.tagID;
  switch (tn) {
    case TAG_ID.TD:
    case TAG_ID.TH: {
      p.openElements.hasInTableScope(tn) && (p.openElements.generateImpliedEndTags(), p.openElements.popUntilTagNamePopped(tn), p.activeFormattingElements.clearToLastMarker(), p.insertionMode = InsertionMode.IN_ROW);
      break;
    }
    case TAG_ID.TABLE:
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD:
    case TAG_ID.TR: {
      p.openElements.hasInTableScope(tn) && (p._closeTableCell(), endTagInRow(p, token));
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.HTML:
      break;
    default:
      endTagInBody(p, token);
  }
}
function startTagInSelect(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.OPTION: {
      p.openElements.currentTagId === TAG_ID.OPTION && p.openElements.pop(), p._insertElement(token, NS.HTML);
      break;
    }
    case TAG_ID.OPTGROUP: {
      p.openElements.currentTagId === TAG_ID.OPTION && p.openElements.pop(), p.openElements.currentTagId === TAG_ID.OPTGROUP && p.openElements.pop(), p._insertElement(token, NS.HTML);
      break;
    }
    case TAG_ID.HR: {
      p.openElements.currentTagId === TAG_ID.OPTION && p.openElements.pop(), p.openElements.currentTagId === TAG_ID.OPTGROUP && p.openElements.pop(), p._appendElement(token, NS.HTML), token.ackSelfClosing = !0;
      break;
    }
    case TAG_ID.INPUT:
    case TAG_ID.KEYGEN:
    case TAG_ID.TEXTAREA:
    case TAG_ID.SELECT: {
      p.openElements.hasInSelectScope(TAG_ID.SELECT) && (p.openElements.popUntilTagNamePopped(TAG_ID.SELECT), p._resetInsertionMode(), token.tagID !== TAG_ID.SELECT && p._processStartTag(token));
      break;
    }
    case TAG_ID.SCRIPT:
    case TAG_ID.TEMPLATE: {
      startTagInHead(p, token);
      break;
    }
    default:
  }
}
function endTagInSelect(p, token) {
  switch (token.tagID) {
    case TAG_ID.OPTGROUP: {
      p.openElements.stackTop > 0 && p.openElements.currentTagId === TAG_ID.OPTION && p.openElements.tagIDs[p.openElements.stackTop - 1] === TAG_ID.OPTGROUP && p.openElements.pop(), p.openElements.currentTagId === TAG_ID.OPTGROUP && p.openElements.pop();
      break;
    }
    case TAG_ID.OPTION: {
      p.openElements.currentTagId === TAG_ID.OPTION && p.openElements.pop();
      break;
    }
    case TAG_ID.SELECT: {
      p.openElements.hasInSelectScope(TAG_ID.SELECT) && (p.openElements.popUntilTagNamePopped(TAG_ID.SELECT), p._resetInsertionMode());
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    default:
  }
}
function startTagInSelectInTable(p, token) {
  let tn = token.tagID;
  tn === TAG_ID.CAPTION || tn === TAG_ID.TABLE || tn === TAG_ID.TBODY || tn === TAG_ID.TFOOT || tn === TAG_ID.THEAD || tn === TAG_ID.TR || tn === TAG_ID.TD || tn === TAG_ID.TH ? (p.openElements.popUntilTagNamePopped(TAG_ID.SELECT), p._resetInsertionMode(), p._processStartTag(token)) : startTagInSelect(p, token);
}
function endTagInSelectInTable(p, token) {
  let tn = token.tagID;
  tn === TAG_ID.CAPTION || tn === TAG_ID.TABLE || tn === TAG_ID.TBODY || tn === TAG_ID.TFOOT || tn === TAG_ID.THEAD || tn === TAG_ID.TR || tn === TAG_ID.TD || tn === TAG_ID.TH ? p.openElements.hasInTableScope(tn) && (p.openElements.popUntilTagNamePopped(TAG_ID.SELECT), p._resetInsertionMode(), p.onEndTag(token)) : endTagInSelect(p, token);
}
function startTagInTemplate(p, token) {
  switch (token.tagID) {
    // First, handle tags that can start without a mode change
    case TAG_ID.BASE:
    case TAG_ID.BASEFONT:
    case TAG_ID.BGSOUND:
    case TAG_ID.LINK:
    case TAG_ID.META:
    case TAG_ID.NOFRAMES:
    case TAG_ID.SCRIPT:
    case TAG_ID.STYLE:
    case TAG_ID.TEMPLATE:
    case TAG_ID.TITLE: {
      startTagInHead(p, token);
      break;
    }
    // Re-process the token in the appropriate mode
    case TAG_ID.CAPTION:
    case TAG_ID.COLGROUP:
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD: {
      p.tmplInsertionModeStack[0] = InsertionMode.IN_TABLE, p.insertionMode = InsertionMode.IN_TABLE, startTagInTable(p, token);
      break;
    }
    case TAG_ID.COL: {
      p.tmplInsertionModeStack[0] = InsertionMode.IN_COLUMN_GROUP, p.insertionMode = InsertionMode.IN_COLUMN_GROUP, startTagInColumnGroup(p, token);
      break;
    }
    case TAG_ID.TR: {
      p.tmplInsertionModeStack[0] = InsertionMode.IN_TABLE_BODY, p.insertionMode = InsertionMode.IN_TABLE_BODY, startTagInTableBody(p, token);
      break;
    }
    case TAG_ID.TD:
    case TAG_ID.TH: {
      p.tmplInsertionModeStack[0] = InsertionMode.IN_ROW, p.insertionMode = InsertionMode.IN_ROW, startTagInRow(p, token);
      break;
    }
    default:
      p.tmplInsertionModeStack[0] = InsertionMode.IN_BODY, p.insertionMode = InsertionMode.IN_BODY, startTagInBody(p, token);
  }
}
function endTagInTemplate(p, token) {
  token.tagID === TAG_ID.TEMPLATE && templateEndTagInHead(p, token);
}
function eofInTemplate(p, token) {
  p.openElements.tmplCount > 0 ? (p.openElements.popUntilTagNamePopped(TAG_ID.TEMPLATE), p.activeFormattingElements.clearToLastMarker(), p.tmplInsertionModeStack.shift(), p._resetInsertionMode(), p.onEof(token)) : stopParsing(p, token);
}
function startTagAfterBody(p, token) {
  token.tagID === TAG_ID.HTML ? startTagInBody(p, token) : tokenAfterBody(p, token);
}
function endTagAfterBody(p, token) {
  var _a;
  if (token.tagID === TAG_ID.HTML) {
    if (p.fragmentContext || (p.insertionMode = InsertionMode.AFTER_AFTER_BODY), p.options.sourceCodeLocationInfo && p.openElements.tagIDs[0] === TAG_ID.HTML) {
      p._setEndLocation(p.openElements.items[0], token);
      let bodyElement = p.openElements.items[1];
      bodyElement && !(!((_a = p.treeAdapter.getNodeSourceCodeLocation(bodyElement)) === null || _a === void 0) && _a.endTag) && p._setEndLocation(bodyElement, token);
    }
  } else
    tokenAfterBody(p, token);
}
function tokenAfterBody(p, token) {
  p.insertionMode = InsertionMode.IN_BODY, modeInBody(p, token);
}
function startTagInFrameset(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.FRAMESET: {
      p._insertElement(token, NS.HTML);
      break;
    }
    case TAG_ID.FRAME: {
      p._appendElement(token, NS.HTML), token.ackSelfClosing = !0;
      break;
    }
    case TAG_ID.NOFRAMES: {
      startTagInHead(p, token);
      break;
    }
    default:
  }
}
function endTagInFrameset(p, token) {
  token.tagID === TAG_ID.FRAMESET && !p.openElements.isRootHtmlElementCurrent() && (p.openElements.pop(), !p.fragmentContext && p.openElements.currentTagId !== TAG_ID.FRAMESET && (p.insertionMode = InsertionMode.AFTER_FRAMESET));
}
function startTagAfterFrameset(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.NOFRAMES: {
      startTagInHead(p, token);
      break;
    }
    default:
  }
}
function endTagAfterFrameset(p, token) {
  token.tagID === TAG_ID.HTML && (p.insertionMode = InsertionMode.AFTER_AFTER_FRAMESET);
}
function startTagAfterAfterBody(p, token) {
  token.tagID === TAG_ID.HTML ? startTagInBody(p, token) : tokenAfterAfterBody(p, token);
}
function tokenAfterAfterBody(p, token) {
  p.insertionMode = InsertionMode.IN_BODY, modeInBody(p, token);
}
function startTagAfterAfterFrameset(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.NOFRAMES: {
      startTagInHead(p, token);
      break;
    }
    default:
  }
}
function nullCharacterInForeignContent(p, token) {
  token.chars = REPLACEMENT_CHARACTER, p._insertCharacters(token);
}
function characterInForeignContent(p, token) {
  p._insertCharacters(token), p.framesetOk = !1;
}
function popUntilHtmlOrIntegrationPoint(p) {
  for (; p.treeAdapter.getNamespaceURI(p.openElements.current) !== NS.HTML && p.openElements.currentTagId !== void 0 && !p._isIntegrationPoint(p.openElements.currentTagId, p.openElements.current); )
    p.openElements.pop();
}
function startTagInForeignContent(p, token) {
  if (causesExit(token))
    popUntilHtmlOrIntegrationPoint(p), p._startTagOutsideForeignContent(token);
  else {
    let current = p._getAdjustedCurrentElement(), currentNs = p.treeAdapter.getNamespaceURI(current);
    currentNs === NS.MATHML ? adjustTokenMathMLAttrs(token) : currentNs === NS.SVG && (adjustTokenSVGTagName(token), adjustTokenSVGAttrs(token)), adjustTokenXMLAttrs(token), token.selfClosing ? p._appendElement(token, currentNs) : p._insertElement(token, currentNs), token.ackSelfClosing = !0;
  }
}
function endTagInForeignContent(p, token) {
  if (token.tagID === TAG_ID.P || token.tagID === TAG_ID.BR) {
    popUntilHtmlOrIntegrationPoint(p), p._endTagOutsideForeignContent(token);
    return;
  }
  for (let i = p.openElements.stackTop; i > 0; i--) {
    let element = p.openElements.items[i];
    if (p.treeAdapter.getNamespaceURI(element) === NS.HTML) {
      p._endTagOutsideForeignContent(token);
      break;
    }
    let tagName = p.treeAdapter.getTagName(element);
    if (tagName.toLowerCase() === token.tagName) {
      token.tagName = tagName, p.openElements.shortenToLength(i);
      break;
    }
  }
}

// ../../node_modules/.pnpm/entities@8.0.0/node_modules/entities/dist/escape.js
var getCodePoint = typeof String.prototype.codePointAt == "function" ? (input, index) => input.codePointAt(index) : (
  // http://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
  (c, index) => (c.charCodeAt(index) & 64512) === 55296 ? (c.charCodeAt(index) - 55296) * 1024 + c.charCodeAt(index + 1) - 56320 + 65536 : c.charCodeAt(index)
);
function getEscaper(regex, map2) {
  return function(data) {
    let match, lastIndex = 0, result = "";
    for (; match = regex.exec(data); )
      lastIndex !== match.index && (result += data.substring(lastIndex, match.index)), result += map2.get(match[0].charCodeAt(0)), lastIndex = match.index + 1;
    return result + data.substring(lastIndex);
  };
}
var escapeAttribute = /* @__PURE__ */ getEscaper(/["&\u00A0]/g, /* @__PURE__ */ new Map([
  [34, "&quot;"],
  [38, "&amp;"],
  [160, "&nbsp;"]
])), escapeText = /* @__PURE__ */ getEscaper(/[&<>\u00A0]/g, /* @__PURE__ */ new Map([
  [38, "&amp;"],
  [60, "&lt;"],
  [62, "&gt;"],
  [160, "&nbsp;"]
]));

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/serializer/index.js
var VOID_ELEMENTS = /* @__PURE__ */ new Set([
  TAG_NAMES.AREA,
  TAG_NAMES.BASE,
  TAG_NAMES.BASEFONT,
  TAG_NAMES.BGSOUND,
  TAG_NAMES.BR,
  TAG_NAMES.COL,
  TAG_NAMES.EMBED,
  TAG_NAMES.FRAME,
  TAG_NAMES.HR,
  TAG_NAMES.IMG,
  TAG_NAMES.INPUT,
  TAG_NAMES.KEYGEN,
  TAG_NAMES.LINK,
  TAG_NAMES.META,
  TAG_NAMES.PARAM,
  TAG_NAMES.SOURCE,
  TAG_NAMES.TRACK,
  TAG_NAMES.WBR
]);
function isVoidElement(node, options) {
  return options.treeAdapter.isElementNode(node) && options.treeAdapter.getNamespaceURI(node) === NS.HTML && VOID_ELEMENTS.has(options.treeAdapter.getTagName(node));
}
var defaultOpts = { treeAdapter: defaultTreeAdapter, scriptingEnabled: !0 };
function serialize(node, options) {
  let opts = { ...defaultOpts, ...options };
  return isVoidElement(node, opts) ? "" : serializeChildNodes(node, opts);
}
function serializeChildNodes(parentNode, options) {
  let html = "", container = options.treeAdapter.isElementNode(parentNode) && options.treeAdapter.getTagName(parentNode) === TAG_NAMES.TEMPLATE && options.treeAdapter.getNamespaceURI(parentNode) === NS.HTML ? options.treeAdapter.getTemplateContent(parentNode) : parentNode, childNodes = options.treeAdapter.getChildNodes(container);
  if (childNodes)
    for (let currentNode of childNodes)
      html += serializeNode(currentNode, options);
  return html;
}
function serializeNode(node, options) {
  return options.treeAdapter.isElementNode(node) ? serializeElement(node, options) : options.treeAdapter.isTextNode(node) ? serializeTextNode(node, options) : options.treeAdapter.isCommentNode(node) ? serializeCommentNode(node, options) : options.treeAdapter.isDocumentTypeNode(node) ? serializeDocumentTypeNode(node, options) : "";
}
function serializeElement(node, options) {
  let tn = options.treeAdapter.getTagName(node);
  return `<${tn}${serializeAttributes(node, options)}>${isVoidElement(node, options) ? "" : `${serializeChildNodes(node, options)}</${tn}>`}`;
}
function serializeAttributes(node, { treeAdapter }) {
  let html = "";
  for (let attr of treeAdapter.getAttrList(node)) {
    if (html += " ", attr.namespace)
      switch (attr.namespace) {
        case NS.XML: {
          html += `xml:${attr.name}`;
          break;
        }
        case NS.XMLNS: {
          attr.name !== "xmlns" && (html += "xmlns:"), html += attr.name;
          break;
        }
        case NS.XLINK: {
          html += `xlink:${attr.name}`;
          break;
        }
        default:
          html += `${attr.prefix}:${attr.name}`;
      }
    else
      html += attr.name;
    html += `="${escapeAttribute(attr.value)}"`;
  }
  return html;
}
function serializeTextNode(node, options) {
  let { treeAdapter } = options, content = treeAdapter.getTextNodeContent(node), parent = treeAdapter.getParentNode(node), parentTn = parent && treeAdapter.isElementNode(parent) && treeAdapter.getTagName(parent);
  return parentTn && treeAdapter.getNamespaceURI(parent) === NS.HTML && hasUnescapedText(parentTn, options.scriptingEnabled) ? content : escapeText(content);
}
function serializeCommentNode(node, { treeAdapter }) {
  return `<!--${treeAdapter.getCommentNodeContent(node)}-->`;
}
function serializeDocumentTypeNode(node, { treeAdapter }) {
  return `<!DOCTYPE ${treeAdapter.getDocumentTypeNodeName(node)}>`;
}

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/index.js
function parseFragment(fragmentContext, html, options) {
  typeof fragmentContext == "string" && (options = html, html = fragmentContext, fragmentContext = null);
  let parser = Parser.getFragmentParser(fragmentContext, options);
  return parser.tokenizer.write(html, !0), parser.getFragment();
}

// ../../packages/core/src/render/reader/html-parser.ts
function stripCodeFenceWrapper(html) {
  return html.trim().match(/^```\w*\s*\n([\s\S]*?)\n```\s*$/)?.[1] ?? html;
}
function parseHtml(html) {
  return { children: parseFragment(html).childNodes.map((c) => convertNode(c)).filter((n) => n !== void 0), type: "document" };
}
function walkElements(root) {
  let out = [];
  return walk(root, out), out;
}
function walk(node, out) {
  if (node.type === "element" && out.push(node), node.type === "element" || node.type === "document")
    for (let child of node.children) walk(child, out);
}
function getInnerText(node) {
  return collapseWhitespace(getInnerTextRaw(node));
}
function getInnerTextRaw(node) {
  return node.type === "text" ? node.text : node.type === "element" || node.type === "document" ? node.children.map((c) => getInnerTextRaw(c)).join(" ") : "";
}
function collapseWhitespace(text) {
  return text.replaceAll(/\s+/g, " ").trim();
}
function serializeHtml(root) {
  return serialize(toParse5Fragment(root));
}
function convertNode(node) {
  if (isTextNode(node))
    return { text: node.value, type: "text" };
  if (isElementNode(node)) {
    let attributes = {};
    for (let attr of node.attrs)
      attributes[attr.name] = attr.value;
    let children = node.childNodes.map((c) => convertNode(c)).filter((c) => c !== void 0);
    return {
      attributes,
      children,
      tagName: node.tagName.toLowerCase(),
      type: "element"
    };
  }
}
function isTextNode(node) {
  return node.nodeName === "#text";
}
function isElementNode(node) {
  return "tagName" in node && "attrs" in node && "childNodes" in node;
}
function toParse5Fragment(doc) {
  let fragment = defaultTreeAdapter.createDocumentFragment();
  return appendChildren(fragment, doc.children), fragment;
}
function appendChildren(parent, children) {
  for (let child of children)
    if (child.type === "text") {
      let textNode = defaultTreeAdapter.createTextNode(child.text);
      defaultTreeAdapter.appendChild(parent, textNode);
    } else if (child.type === "element") {
      let attrs = Object.entries(child.attributes).map(([name, value]) => ({
        name,
        value
      })), element = defaultTreeAdapter.createElement(
        child.tagName,
        html_exports.NS.HTML,
        attrs
      );
      appendChildren(element, child.children), defaultTreeAdapter.appendChild(parent, element);
    }
}

// ../../packages/core/src/render/reader/element-axis-index.ts
var ElementAxisIndex = class {
  attrIndex = /* @__PURE__ */ new Map();
  pathToMemberships = /* @__PURE__ */ new Map();
  tagIndex = /* @__PURE__ */ new Map();
  /** How many paths the index currently knows about. */
  get size() {
    return this.pathToMemberships.size;
  }
  /** Register every element in `entries` against `filePath`. */
  add(filePath, entries) {
    let memberships = this.pathToMemberships.get(filePath);
    memberships || (memberships = [], this.pathToMemberships.set(filePath, memberships));
    for (let entry of entries) {
      this.addToTagIndex(entry.tag, filePath, memberships);
      for (let [attr, value] of Object.entries(entry.attributes))
        this.addToAttrIndex(entry.tag, attr, value, filePath, memberships);
    }
  }
  /** Drop every entry — used on full corpus rebuild. */
  clear() {
    this.tagIndex.clear(), this.attrIndex.clear(), this.pathToMemberships.clear();
  }
  /** Paths containing an element of `tag` whose `attribute` holds the exact `value`. */
  findByAttribute(tag, attribute, value) {
    let set2 = this.attrIndex.get(tag)?.get(attribute)?.get(value);
    return set2 ? [...set2] : [];
  }
  /** Paths containing at least one element of `tag` (empty array if none). */
  findByTag(tag) {
    let set2 = this.tagIndex.get(tag);
    return set2 ? [...set2] : [];
  }
  /** Drop every membership tied to `filePath` (before re-indexing, or on delete). */
  remove(filePath) {
    let memberships = this.pathToMemberships.get(filePath);
    if (memberships) {
      for (let m of memberships)
        if (m.kind === "tag") {
          let set2 = this.tagIndex.get(m.tag);
          if (!set2) continue;
          set2.delete(filePath), set2.size === 0 && this.tagIndex.delete(m.tag);
        } else {
          let tagBucket = this.attrIndex.get(m.tag), attrBucket = tagBucket?.get(m.attr), set2 = attrBucket?.get(m.value);
          if (!set2 || !tagBucket || !attrBucket) continue;
          set2.delete(filePath), set2.size === 0 && (attrBucket.delete(m.value), attrBucket.size === 0 && (tagBucket.delete(m.attr), tagBucket.size === 0 && this.attrIndex.delete(m.tag)));
        }
      this.pathToMemberships.delete(filePath);
    }
  }
  addToAttrIndex(tag, attr, value, filePath, memberships) {
    let tagBucket = this.attrIndex.get(tag);
    tagBucket || (tagBucket = /* @__PURE__ */ new Map(), this.attrIndex.set(tag, tagBucket));
    let attrBucket = tagBucket.get(attr);
    attrBucket || (attrBucket = /* @__PURE__ */ new Map(), tagBucket.set(attr, attrBucket));
    let set2 = attrBucket.get(value);
    set2 || (set2 = /* @__PURE__ */ new Set(), attrBucket.set(value, set2)), set2.add(filePath), memberships.push({ attr, kind: "attr", tag, value });
  }
  addToTagIndex(tag, filePath, memberships) {
    let set2 = this.tagIndex.get(tag);
    set2 || (set2 = /* @__PURE__ */ new Set(), this.tagIndex.set(tag, set2)), set2.add(filePath), memberships.push({ kind: "tag", tag });
  }
};

// ../../packages/core/src/render/reader/html-reader.ts
import { readFile } from "node:fs/promises";
function readHtmlTopicSync(html) {
  let document = parseHtml(html), allElements = walkElements(document), bodyText = getInnerText(document), imageContent = extractImageContent(allElements), elements = [], topicAttributes = {}, topicSeen = !1;
  for (let el of allElements)
    el.tagName === "bv-topic" && !topicSeen && (topicAttributes = el.attributes, topicSeen = !0), isRegisteredElementName(el.tagName) && elements.push({
      attributes: el.attributes,
      tag: el.tagName,
      text: getInnerText(el)
    });
  return { bodyText, elements, imageContent, topicAttributes };
}
function extractImageContent(elements) {
  let parts = [];
  for (let el of elements) {
    if (el.tagName !== "img") continue;
    let alt = (el.attributes.alt ?? "").trim(), src = (el.attributes.src ?? "").trim();
    alt.length > 0 && parts.push(alt), src.length > 0 && parts.push(src);
  }
  return parts.join(" ");
}
async function readHtmlTopic(filePath) {
  let html = await readFile(filePath, "utf8");
  return readHtmlTopicSync(html);
}
function isRegisteredElementName(tag) {
  return ELEMENT_NAMES.includes(tag);
}

// ../../packages/storage/src/paths.ts
import { resolve, sep } from "node:path";
function resolveWithin(root, key) {
  let base = resolve(root), resolved = resolve(base, key);
  if (resolved !== base && !resolved.startsWith(base + sep))
    throw new Error(`Key escapes storage root: ${key}`);
  return resolved;
}
function toKey(root, absolutePath, suffix) {
  let base = resolve(root), rel = resolve(absolutePath).slice(base.length + 1);
  return suffix && rel.endsWith(suffix) && (rel = rel.slice(0, -suffix.length)), rel.split(sep).join("/");
}

// ../../packages/storage/src/cas-atomic-write.ts
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
var tmpCounter = 0, RENAME_RETRY_DELAYS_MS = [10, 25, 50, 100, 200];
async function renameWithRetry(tmp, filePath) {
  for (let delayMs of RENAME_RETRY_DELAYS_MS)
    try {
      await rename(tmp, filePath);
      return;
    } catch (err) {
      let code = err.code;
      if (code !== "EPERM" && code !== "EACCES") throw err;
      await new Promise((resolve11) => setTimeout(resolve11, delayMs));
    }
  await rename(tmp, filePath);
}
async function writeFileAtomic(filePath, data, options = {}) {
  await mkdir(dirname(filePath), { recursive: !0 });
  let tmp = `${filePath}.tmp-${process.pid}-${tmpCounter++}`;
  try {
    if (options.mode === void 0)
      await writeFile(tmp, data);
    else {
      await writeFile(tmp, data, { mode: options.mode });
      try {
        await chmod(tmp, options.mode);
      } catch (err) {
        let code = err.code;
        if (code !== "ENOENT" && code !== "EPERM" && code !== "EACCES")
          throw err;
      }
    }
    await renameWithRetry(tmp, filePath);
  } catch (err) {
    throw await rm(tmp, { force: !0 }), err;
  }
}

// ../../packages/storage/src/file-key-storage.ts
import { readdir, readFile as readFile2, rm as rm2 } from "node:fs/promises";
import { join } from "node:path";
var EXT = ".json", FileKeyStorage = class {
  constructor(root) {
    this.root = root;
  }
  pathFor(key) {
    return resolveWithin(this.root, `${key}${EXT}`);
  }
  async get(key) {
    try {
      let raw = await readFile2(this.pathFor(key), "utf8");
      return JSON.parse(raw);
    } catch (err) {
      if (err.code === "ENOENT") return;
      throw err;
    }
  }
  async set(key, value) {
    await writeFileAtomic(this.pathFor(key), `${JSON.stringify(value, null, "	")}
`);
  }
  async has(key) {
    return await this.get(key) !== void 0;
  }
  async delete(key) {
    await rm2(this.pathFor(key), { force: !0 });
  }
  async keys(prefix = "") {
    let out = [];
    return await this.walk(this.root, out), out.filter((k) => k.startsWith(prefix)).sort();
  }
  async walk(dir, out) {
    let entries = await readdir(dir, { withFileTypes: !0 }).catch(
      (err) => {
        if (err.code === "ENOENT") return [];
        throw err;
      }
    );
    for (let entry of entries) {
      let abs = join(dir, entry.name);
      entry.isDirectory() ? await this.walk(abs, out) : entry.isFile() && entry.name.endsWith(EXT) && out.push(toKey(this.root, abs, EXT));
    }
  }
};

// ../../packages/core/src/render/writer/element-id.ts
import { randomBytes } from "node:crypto";
var ELEMENT_ID_PREFIX = "bve-", NANO_ID_LENGTH = 8, NANO_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789", ELEMENT_ID_PATTERN = /^bve-[a-z0-9]{8}$/, INDEXED_ELEMENT_NAMES = /* @__PURE__ */ new Set([
  "bv-fact",
  "bv-decision",
  "bv-flow",
  "bv-rule",
  "bv-bug",
  "bv-fix",
  "bv-pattern",
  "bv-task",
  "bv-changes",
  "bv-highlights",
  "bv-structure",
  "bv-examples",
  "bv-diagram"
]);
function isIndexedElementTag(tagName) {
  return INDEXED_ELEMENT_NAMES.has(tagName);
}
function generateElementId(rng = defaultNanoId) {
  return `${ELEMENT_ID_PREFIX}${rng()}`;
}
function defaultNanoId() {
  let bytes = randomBytes(NANO_ID_LENGTH), out = "";
  for (let i = 0; i < NANO_ID_LENGTH; i++) {
    let byte = bytes[i];
    byte !== void 0 && (out += NANO_ID_ALPHABET[byte % NANO_ID_ALPHABET.length]);
  }
  return out;
}
function isValidElementId(s) {
  return ELEMENT_ID_PATTERN.test(s);
}
function stampElementIds(html, makeId = generateElementId) {
  let result = html, cursor = 0;
  for (; cursor < result.length; ) {
    let tag = findNextIndexedOpenTag(result, cursor);
    if (!tag) break;
    let existing = readIdAttributeFromOpenTag(tag.openTag);
    if (existing !== void 0 && isValidElementId(existing)) {
      cursor = tag.endIndex;
      continue;
    }
    let newId = makeId(), replaced = existing !== void 0 ? replaceIdInOpenTag(tag.openTag, newId) : insertIdIntoOpenTag(tag.openTag, newId);
    result = result.substring(0, tag.startIndex) + replaced + result.substring(tag.endIndex), cursor = tag.startIndex + replaced.length;
  }
  return result;
}
function findNextIndexedOpenTag(html, from) {
  let cursor = from;
  for (; cursor < html.length; ) {
    let lt = html.indexOf("<", cursor);
    if (lt < 0) return;
    if (html[lt + 1] === "/") {
      cursor = lt + 2;
      continue;
    }
    let nameEnd = lt + 1;
    for (; nameEnd < html.length && !/[\s/>]/.test(html[nameEnd]); )
      nameEnd++;
    let tagName = html.substring(lt + 1, nameEnd).toLowerCase();
    if (!isIndexedElementTag(tagName)) {
      let skipTo = findOpenTagEnd(html, nameEnd);
      cursor = skipTo < 0 ? nameEnd : skipTo;
      continue;
    }
    let endIndex = findOpenTagEnd(html, nameEnd);
    return endIndex < 0 ? void 0 : {
      endIndex,
      openTag: html.substring(lt, endIndex),
      startIndex: lt
    };
  }
}
function findOpenTagEnd(html, tagBodyStart) {
  let quote;
  for (let i = tagBodyStart; i < html.length; i++) {
    let ch = html[i];
    if (ch === void 0) return -1;
    if (quote !== void 0) {
      ch === quote && (quote = void 0);
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ">") return i + 1;
  }
  return -1;
}
function readIdAttributeFromOpenTag(openTag) {
  let match = openTag.match(
    /\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/i
  );
  if (match)
    return match[1] ?? match[2];
}
function insertIdIntoOpenTag(openTag, newId) {
  let insertAt = openTag.endsWith("/>") ? openTag.length - 2 : openTag.length - 1, before = openTag.substring(0, insertAt), after = openTag.substring(insertAt), needsSpace = !/\s$/.test(before);
  return `${before}${needsSpace ? " " : ""}id="${newId}"${after}`;
}
function replaceIdInOpenTag(openTag, newId) {
  return openTag.replace(
    /\sid\s*=\s*(?:"[^"]*"|'[^']*')/i,
    ` id="${newId}"`
  );
}

// ../../packages/core/src/tree/paths.ts
import { homedir, platform } from "node:os";
import { basename, dirname as dirname2, isAbsolute, join as join2, resolve as resolve2, sep as sep2 } from "node:path";

// ../../packages/core/src/identity/uuid-v4.ts
var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function isUuid(value) {
  return typeof value == "string" && UUID_REGEX.test(value);
}

// ../../packages/core/src/tree/paths.ts
var CONTEXT_TREE_DIRNAME = "context-tree", DAEMON_DIRNAME = ".daemon", DAEMON_SPACES_DIRNAME = "spaces", SYNC_STATE_DIRNAME = "sync", PROJECTS_DIRNAME = "projects", GLOBAL_DATA_DIRNAME = "brv";
function getGlobalDataDir() {
  let override = process.env.BRV_DATA_DIR;
  if (override) return override;
  let dirName = process.env.BRV_DATA_DIRNAME?.trim() || GLOBAL_DATA_DIRNAME, currentPlatform = platform();
  if (currentPlatform === "win32") {
    let localAppData = process.env.LOCALAPPDATA;
    return localAppData !== void 0 ? join2(localAppData, dirName) : join2(homedir(), "AppData", "Local", dirName);
  }
  if (currentPlatform === "darwin")
    return join2(homedir(), "Library", "Application Support", dirName);
  if (currentPlatform === "linux") {
    let xdgDataHome = process.env.XDG_DATA_HOME;
    if (xdgDataHome && isAbsolute(xdgDataHome))
      return join2(xdgDataHome, dirName);
  }
  return join2(homedir(), ".local", "share", dirName);
}
function getProjectsDir() {
  return join2(getGlobalDataDir(), PROJECTS_DIRNAME);
}
function spaceContextTreePath(space_id) {
  return join2(
    getGlobalDataDir(),
    PROJECTS_DIRNAME,
    space_id,
    CONTEXT_TREE_DIRNAME
  );
}
function assertAbsolutePath(label, path2) {
  if (!isAbsolute(path2))
    throw new Error(`${label} must be absolute`);
}
function assertValidSpaceId(spaceId) {
  if (!isUuid(spaceId) || isAbsolute(spaceId) || spaceId.includes("/") || spaceId.includes("\\") || spaceId === "." || spaceId === "..")
    throw new Error(`invalid spaceId for sync state path: ${spaceId}`);
}
function daemonSpaceStateDirForSpace(projectsRoot, spaceId) {
  return assertAbsolutePath("projectsRoot", projectsRoot), assertValidSpaceId(spaceId), join2(projectsRoot, DAEMON_DIRNAME, DAEMON_SPACES_DIRNAME, spaceId);
}
function syncStateDirForSpace(projectsRoot, spaceId) {
  return join2(
    daemonSpaceStateDirForSpace(projectsRoot, spaceId),
    SYNC_STATE_DIRNAME
  );
}
function syncStateDirForSpaceDir(spaceDir) {
  return assertAbsolutePath("spaceDir", spaceDir), syncStateDirForSpace(dirname2(spaceDir), basename(spaceDir));
}
function syncStateDirForContextTreeRoot(contextTreeRoot) {
  if (assertAbsolutePath("contextTreeRoot", contextTreeRoot), basename(contextTreeRoot) !== CONTEXT_TREE_DIRNAME)
    throw new Error(
      `sync state can only be derived from a ${CONTEXT_TREE_DIRNAME} root`
    );
  return syncStateDirForSpaceDir(dirname2(contextTreeRoot));
}
function resolveWithinTree(root, relPath) {
  let base = resolve2(root), resolved = resolve2(base, relPath);
  if (resolved !== base && !resolved.startsWith(base + sep2))
    throw new Error(`Path escapes context-tree root: ${relPath}`);
  return resolved;
}

// ../../packages/core/src/tree/topics.ts
import { readdir as readdir2, rm as rm3 } from "node:fs/promises";
import { join as join3, relative, sep as sep3 } from "node:path";

// ../../packages/core/src/render/writer/html-writer.ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// ../../packages/core/src/identity/canonical.ts
import { createHash } from "node:crypto";

// ../../packages/core/src/render/writer/topic-attributes.ts
function escapeHtmlAttributeValue(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function decodeHtmlAttributeValue(value) {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
}
function matchBvTopicOpenTag(html) {
  let lower = html.toLowerCase(), NAME = "<bv-topic", i = 0;
  for (; i < html.length; ) {
    if (lower.startsWith("<!--", i)) {
      let end = lower.indexOf("-->", i + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (lower.startsWith(NAME, i)) {
      let after = html[i + NAME.length];
      if (after === void 0 || /[\s/>]/.test(after)) {
        let quote;
        for (let j = i + 1; j < html.length; j++) {
          let ch = html[j];
          if (quote !== void 0)
            ch === quote && (quote = void 0);
          else if (ch === '"' || ch === "'")
            quote = ch;
          else if (ch === ">")
            return { index: i, tag: html.slice(i, j + 1) };
        }
        return;
      }
    }
    i++;
  }
}
function readTopicRootAttribute(html, name) {
  let match = matchBvTopicOpenTag(html);
  if (!match) return;
  let attr = match.tag.match(
    new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i")
  ), raw = attr?.[1] ?? attr?.[2];
  return raw === void 0 ? void 0 : decodeHtmlAttributeValue(raw);
}
function patchBvTopicRootAttributes(html, attrs) {
  let result = html;
  for (let [name, value] of Object.entries(attrs))
    result = setBvTopicAttribute(result, name, value);
  return result;
}
function removeBvTopicRootAttributes(html, names) {
  let result = html;
  for (let name of names)
    result = unsetBvTopicAttribute(result, name);
  return result;
}
var ATTR_VALUE_GRAMMAR = `("[^"]*"|'[^']*'|[^\\s"'=<>\`]+)`;
function unsetBvTopicAttribute(html, name) {
  let match = matchBvTopicOpenTag(html);
  if (!match) return html;
  let { index, tag } = match, attrPattern = new RegExp(
    `\\s${name}\\s*=\\s*${ATTR_VALUE_GRAMMAR}`,
    "gi"
  ), newTag = tag.replace(attrPattern, "");
  return newTag === tag ? html : html.slice(0, index) + newTag + html.slice(index + tag.length);
}
function setBvTopicAttribute(html, name, value) {
  let match = matchBvTopicOpenTag(html);
  if (!match) return html;
  let { index, tag } = match, escaped = escapeHtmlAttributeValue(value), attrPattern = new RegExp(
    `\\s${name}\\s*=\\s*${ATTR_VALUE_GRAMMAR}`,
    "gi"
  ), replaced = !1, newTag = tag.replace(attrPattern, () => replaced ? "" : (replaced = !0, ` ${name}="${escaped}"`));
  return replaced || (newTag = tag.endsWith("/>") ? `${tag.slice(0, -2)} ${name}="${escaped}"/>` : `${tag.slice(0, -1)} ${name}="${escaped}">`), html.slice(0, index) + newTag + html.slice(index + tag.length);
}

// ../../packages/core/src/identity/canonical.ts
var CANON_VERSION = "1", EXCLUDED_ROOT_ATTRS = /* @__PURE__ */ new Set([
  "id",
  "path",
  "createdat",
  "updatedat",
  // Agent attribution is system-managed provenance, not semantic content — a
  // rewrite by a different agent must not change the topic's hash, or
  // snapshots/diff would treat attribution as content changes.
  "createdby",
  "updatedby",
  "by",
  "host",
  // Topic signature + signing key-id (Phase 3): cryptographic provenance over the
  // content hash, NOT semantic content. They must be excluded so the hash a
  // signature covers is stable, and so a (re)signature never perturbs diff/dedup.
  // A no-op on legacy topics (which carry neither), so no CANON_VERSION bump.
  "sig",
  "kid",
  // Topic-level disclosure policy (Phase 4): an ACCESS-control label, not
  // semantic content. Excluded so labelling a topic's visibility never changes
  // the hash a signature covers. (A fact's `disclosure` attr is NOT excluded —
  // that is a per-element authoring decision and stays part of the content.)
  "visibility"
]);
function canonicalTopicHash(html) {
  return createHash("sha256").update(`bvtopic
${CANON_VERSION}
${canonicalizeTopic(html)}`).digest("hex");
}
function canonicalizeTopic(html) {
  return serializeElement2(findRootTopic(parseHtml(html)), !0);
}
function readCanonicalRootAttribute(html, name) {
  return findRootTopic(parseHtml(html)).attributes[name];
}
function findRootTopic(doc) {
  let topLevel = doc.children.filter(
    (node) => !(node.type === "text" && node.text.trim() === "")
  ), root = topLevel[0];
  if (topLevel.length !== 1 || root === void 0 || root.type !== "element" || root.tagName !== "bv-topic")
    throw new Error(
      "byterover topic: input must be exactly one top-level <bv-topic> root"
    );
  return root;
}
function serializeElement2(element, isRoot) {
  let attributes = Object.entries(element.attributes).filter(([name]) => !(isRoot && EXCLUDED_ROOT_ATTRS.has(name))).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, value]) => ` ${name}="${escapeHtmlAttributeValue(value)}"`).join("");
  return `<${element.tagName}${attributes}>${serializeChildren(element.children)}</${element.tagName}>`;
}
function serializeChildren(children) {
  let out = "";
  for (let child of children)
    child.type === "text" ? out += escapeText2(child.text.replaceAll(/\s+/g, " ")) : child.type === "element" && (out += serializeElement2(child, !1));
  return out;
}
function escapeText2(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// ../../packages/core/src/identity/topic-id.ts
import { randomUUID } from "node:crypto";
var ID_PREFIX = "tpc_", TOPIC_ID_REGEX = /^tpc_[0-9a-f]{32}$/;
function makeTopicId(rng = randomUUID) {
  return `${ID_PREFIX}${rng().replaceAll("-", "")}`;
}

// ../../packages/core/src/render/writer/html-writer.ts
var RESERVED_TOPIC_PATHS = /* @__PURE__ */ new Set(["index"]);
async function writeHtmlTopic(options) {
  let { confirmOverwrite = !1, contextTreeRoot, rawHtml } = options, cleaned = stripCodeFenceWrapper(rawHtml), validation = validateHtmlTopic(cleaned);
  if (!validation.ok) return { errors: validation.errors, ok: !1 };
  let filePath = topicPathToFilePath(contextTreeRoot, validation.topicPath), relPath = topicPathToRel(validation.topicPath), existed = existsSync(filePath);
  if (!confirmOverwrite && existed)
    return {
      errors: [
        {
          existingContent: readExistingFileSafe(filePath),
          kind: "path-exists",
          message: `A topic already exists at "${validation.topicPath}". Pass \`--overwrite\` to replace it (or set \`confirmOverwrite: true\` when calling writeTopic directly), or merge the new content into the existing topic and re-emit.`,
          topicPath: validation.topicPath
        }
      ],
      ok: !1
    };
  let now = options.now ?? (/* @__PURE__ */ new Date()).toISOString(), createdAt = readExistingTopicAttribute(filePath, "createdat") ?? now, id = readTopicRootAttribute(cleaned, "id") ?? readExistingTopicAttribute(filePath, "id") ?? (options.makeId ?? makeTopicId)(), existingCreatedBy = readExistingTopicAttribute(filePath, "createdby") ?? void 0, existingUpdatedBy = readExistingTopicAttribute(filePath, "updatedby") ?? void 0, validatedAgent = options.agent !== void 0 && AGENT_SLUG_REGEX.test(options.agent) ? options.agent : void 0, createdBy = existingCreatedBy ?? validatedAgent, updatedBy = validatedAgent ?? existingUpdatedBy, stripped = removeBvTopicRootAttributes(cleaned, [
    "createdby",
    "updatedby"
  ]), rootStamped = patchBvTopicRootAttributes(stripped, {
    createdat: createdAt,
    ...createdBy !== void 0 ? { createdby: createdBy } : {},
    id,
    updatedat: now,
    ...updatedBy !== void 0 ? { updatedby: updatedBy } : {}
  }), stamped = stampElementIds(rootStamped, options.makeElementId), finalHtml = stamped;
  if (options.signer) {
    let { sig, kid } = options.signer(canonicalTopicHash(stamped));
    finalHtml = patchBvTopicRootAttributes(stamped, { kid, sig });
  }
  return await writeFileAtomic(filePath, finalHtml), {
    created: !existed,
    filePath,
    ok: !0,
    relPath,
    warnings: computeRelatedWarnings(contextTreeRoot, validation.relatedAttr),
    written: finalHtml
  };
}
function computeRelatedWarnings(contextTreeRoot, relatedAttr) {
  if (!relatedAttr) return [];
  let warnings = [];
  for (let raw of relatedAttr.split(",")) {
    let ref = raw.trim().replace(/^@/, "");
    if (ref.length === 0) continue;
    let segments = ref.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\.html$/i, "").split("/").filter((s) => s.length > 0);
    if (segments.some((s) => s === ".." || s === ".")) {
      warnings.push(`related ref "${ref}" contains an unsafe path segment`);
      continue;
    }
    let targetRel = `${segments.join("/")}.html`;
    existsSync(path.resolve(contextTreeRoot, targetRel)) || warnings.push(
      `related ref "${ref}" has no matching topic at "${targetRel}" (broken or forward reference)`
    );
  }
  return warnings;
}
function topicPathToRel(topicPath) {
  return `${topicPath.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\.html$/i, "").split("/").filter((s) => s.length > 0).join("/")}.html`;
}
function validateHtmlTopic(html) {
  let errors = [], doc = parseHtml(html), elements = walkElements(doc), topics = elements.filter((e) => e.tagName === "bv-topic");
  if (topics.length === 0)
    return {
      errors: [
        {
          kind: "missing-bv-topic",
          message: "Output must contain exactly one <bv-topic> root. Found 0."
        }
      ],
      ok: !1
    };
  if (topics.length > 1)
    return {
      errors: [
        {
          kind: "multiple-bv-topic",
          message: `Output must contain exactly one <bv-topic> root. Found ${topics.length}.`
        }
      ],
      ok: !1
    };
  let topLevel = doc.children.filter(
    (n) => !(n.type === "text" && n.text.trim() === "")
  ), root = topLevel[0];
  if (topLevel.length !== 1 || root === void 0 || root.type !== "element" || root.tagName !== "bv-topic")
    return {
      errors: [
        {
          kind: "topic-not-root",
          message: "<bv-topic> must be the sole top-level root element (no surrounding text or wrapper elements)."
        }
      ],
      ok: !1
    };
  let topic = topics[0];
  if (!topic)
    return {
      errors: [{ kind: "missing-bv-topic", message: "No <bv-topic> root." }],
      ok: !1
    };
  let topicPath = topic.attributes.path;
  if (!topicPath || topicPath.trim().length === 0)
    errors.push({
      kind: "missing-path-attribute",
      message: "<bv-topic> must declare a non-empty `path` attribute."
    });
  else {
    let segments = topicPath.replaceAll("\\", "/").replace(/^\/+/, "").split("/").filter((s) => s.length > 0);
    for (let segment of segments)
      if (segment === ".." || segment === ".") {
        errors.push({
          kind: "unsafe-path",
          message: `bv-topic path may not contain "${segment}" segment: ${topicPath}`
        });
        break;
      }
    let canonical = segments.join("/").replace(/\.html$/i, "").toLowerCase();
    canonical.length === 0 ? errors.push({
      kind: "missing-path-attribute",
      message: "<bv-topic> `path` must contain at least one path segment."
    }) : RESERVED_TOPIC_PATHS.has(canonical) && errors.push({
      kind: "reserved-path",
      message: `"${canonical}" is a reserved path (the context-tree catalog); choose a different topic path.`
    });
  }
  for (let el of elements) {
    if (!el.tagName.startsWith("bv-")) continue;
    if (!isRegisteredElementName2(el.tagName)) {
      errors.push({
        kind: "unknown-bv-element",
        message: `<${el.tagName}> is not in the element registry. Vocabulary is closed.`,
        tag: el.tagName
      });
      continue;
    }
    let result = ELEMENT_REGISTRY[el.tagName].validator(el);
    if (!result.valid)
      for (let issue of result.errors)
        errors.push({
          field: issue.field,
          kind: "attribute-validation",
          message: `<${el.tagName}> ${issue.message}`,
          tag: el.tagName
        });
  }
  return errors.length > 0 ? { errors, ok: !1 } : {
    ok: !0,
    relatedAttr: topic.attributes.related,
    topicPath
  };
}
function isRegisteredElementName2(tag) {
  return ELEMENT_NAMES.includes(tag);
}
function topicPathToFilePath(contextTreeRoot, topicPath) {
  let segments = topicPath.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\.html$/i, "").split("/").filter((s) => s.length > 0);
  for (let segment of segments)
    if (segment === ".." || segment === ".")
      throw new Error(
        `bv-topic path may not contain "${segment}" segment: ${topicPath}`
      );
  let relative3 = `${segments.join("/")}.html`, resolved = path.resolve(contextTreeRoot, relative3), rootResolved = path.resolve(contextTreeRoot);
  if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved)
    throw new Error(
      `bv-topic path escapes the context-tree root: ${topicPath}`
    );
  return resolved;
}
function readExistingTopicAttribute(filePath, attrName) {
  if (!existsSync(filePath)) return null;
  try {
    return readTopicRootAttribute(readFileSync(filePath, "utf8"), attrName) ?? null;
  } catch {
    return null;
  }
}
function readExistingFileSafe(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return;
  }
}

// ../../packages/core/src/tree/topics.ts
var INDEX_FILE = "index.html", DERIVED_ARTIFACT_RE = /\.(abstract|full|overview)\.html$/i;
function isDerivedArtifact(path2) {
  return DERIVED_ARTIFACT_RE.test(path2);
}
function estimateTokens(text) {
  return Math.ceil(text.trim().length / 4);
}
function normalizeRel(p) {
  return p.split(sep3).join("/");
}
async function walkHtml(root, dir, out) {
  let entries = await readdir2(dir, { withFileTypes: !0 }).catch(
    (err) => {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  );
  for (let entry of entries) {
    let abs = join3(dir, entry.name);
    if (entry.isDirectory())
      await walkHtml(root, abs, out);
    else if (entry.isFile() && entry.name.endsWith(".html")) {
      let rel = normalizeRel(relative(root, abs));
      rel !== INDEX_FILE && !isDerivedArtifact(rel) && out.push(rel);
    }
  }
}
async function listTopics(root) {
  let out = [];
  return await walkHtml(root, root, out), out.sort();
}
async function readTopic(root, relPath) {
  let abs = resolveWithinTree(root, relPath), read = await readHtmlTopic(abs);
  return {
    attributes: read.topicAttributes,
    bodyText: read.bodyText,
    elements: read.elements,
    imageContent: read.imageContent,
    path: normalizeRel(relPath)
  };
}
async function writeTopic(root, options) {
  return writeHtmlTopic({ ...options, contextTreeRoot: root });
}
async function deleteTopic(root, relPath) {
  await rm3(resolveWithinTree(root, relPath), { force: !0 });
}

// ../../packages/core/src/render/materialize-layer.ts
function materializeLayer(html, layer) {
  if (layer === "full") return html;
  let root = rootTopic(html);
  if (layer === "redacted") {
    let children = redactNodes(root.children), attributes = keepAttrs(root.attributes, REDACTED_KEEP_ROOT_ATTRS);
    return emit({ ...root, attributes, children });
  }
  return emit({
    ...root,
    attributes: keepAttrs(root.attributes, METADATA_KEEP_ROOT_ATTRS),
    children: []
  });
}
function oneOf(...allowed) {
  let set2 = new Set(allowed);
  return (value) => set2.has(value) ? value : void 0;
}
var opaqueTopicId = (value) => TOPIC_ID_REGEX.test(value) ? value : void 0, ISO_8601 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/, iso8601Instant = (value) => {
  let m = ISO_8601.exec(value);
  if (!m) return;
  let year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59)
    return;
  let utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day ? value : void 0;
}, publicByContract = (value) => value, TOPIC_TYPE = oneOf("topic", "summary", "context"), TOPIC_VISIBILITY = oneOf("public", "restricted"), FACT_DISCLOSURE = oneOf("public", "restricted"), FACT_CATEGORY = oneOf(
  "personal",
  "project",
  "preference",
  "convention",
  "team",
  "environment",
  "other"
), BUG_SEVERITY = oneOf("low", "medium", "high", "critical"), RULE_SEVERITY = oneOf("info", "must", "should"), DIAGRAM_TYPE = oneOf(
  "mermaid",
  "plantuml",
  "ascii",
  "dot",
  "graphviz",
  "other"
), REDACTED_KEEP_ROOT_ATTRS = {
  id: opaqueTopicId,
  title: publicByContract,
  type: TOPIC_TYPE,
  createdat: iso8601Instant,
  updatedat: iso8601Instant,
  visibility: TOPIC_VISIBILITY
}, REDACTED_KEEP_DESCENDANT_ATTRS = {
  "bv-bug": { id: opaqueTopicId, severity: BUG_SEVERITY },
  "bv-decision": { id: opaqueTopicId },
  "bv-diagram": { type: DIAGRAM_TYPE },
  "bv-fact": { disclosure: FACT_DISCLOSURE, category: FACT_CATEGORY },
  "bv-fix": { id: opaqueTopicId },
  "bv-rule": { id: opaqueTopicId, severity: RULE_SEVERITY }
}, METADATA_KEEP_ROOT_ATTRS = {
  id: opaqueTopicId,
  type: TOPIC_TYPE,
  createdat: iso8601Instant,
  updatedat: iso8601Instant
};
var SAFE_HTML_ELEMENTS = [
  // headings
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  // block / structural prose
  "p",
  "blockquote",
  "pre",
  "hr",
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "main",
  "figure",
  "figcaption",
  "details",
  "summary",
  // lists
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  // tables
  "table",
  "caption",
  "colgroup",
  "col",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  // inline
  "span",
  "a",
  "em",
  "strong",
  "b",
  "i",
  "u",
  "s",
  "del",
  "ins",
  "mark",
  "small",
  "sub",
  "sup",
  "code",
  "kbd",
  "samp",
  "var",
  "abbr",
  "cite",
  "q",
  "time",
  "dfn",
  "br",
  "wbr",
  "img"
], REDACTED_ALLOWED_ELEMENTS = /* @__PURE__ */ new Set([
  ...ELEMENT_NAMES,
  ...SAFE_HTML_ELEMENTS
]);
function keepAttrs(attributes, allow) {
  let out = {};
  for (let [name, validate] of Object.entries(allow)) {
    let raw = attributes[name];
    if (raw === void 0) continue;
    let kept = validate(raw);
    kept !== void 0 && (out[name] = kept);
  }
  return out;
}
function rootTopic(html) {
  return findRootTopic(parseHtml(html));
}
function emit(root) {
  return serializeHtml({ type: "document", children: [root] });
}
function isStripped(node) {
  return node.type !== "element" || node.tagName !== "bv-fact" ? !1 : node.attributes.disclosure !== "public";
}
function redactNodes(nodes) {
  let out = [];
  for (let node of nodes) {
    if (node.type === "text") {
      out.push(node);
      continue;
    }
    node.type === "element" && REDACTED_ALLOWED_ELEMENTS.has(node.tagName) && (isStripped(node) || out.push({
      ...node,
      attributes: keepAttrs(
        node.attributes,
        REDACTED_KEEP_DESCENDANT_ATTRS[node.tagName] ?? {}
      ),
      children: redactNodes(node.children)
    }));
  }
  return out;
}

// ../../packages/core/src/reconcile/mutation-event.ts
function emptyReconcileResult() {
  return {
    elapsed_ms: 0,
    index_rebuilt: !1,
    manifest_rebuilt: !1,
    related_refs_marked_orphan: [],
    related_refs_rewritten: [],
    related_refs_unmarked: [],
    search_index_updated: !1,
    signals_quarantined: 0,
    signals_restored: 0,
    should_emit_sync_event: !1,
    warnings: []
  };
}

// ../../packages/core/src/reconcile/reconciler.ts
import { mkdir as mkdir3, writeFile as writeFile3 } from "node:fs/promises";
import { dirname as dirname5, join as join8 } from "node:path";

// ../../packages/core/src/tree/signals.ts
import { dirname as dirname3, join as join4 } from "node:path";

// ../../packages/core/src/scoring/memory-scoring.ts
var TIER_BOOST = {
  core: 1.15,
  draft: 0.85,
  validated: 1
};
function compoundScore(bm25Normalized, signals) {
  let normalizedImportance = Math.min(signals.importance, 100) / 100;
  return (0.6 * bm25Normalized + 0.2 * normalizedImportance + 0.2 * signals.recency) * TIER_BOOST[signals.maturity];
}
function applyDecay(signals, daysSinceLastUpdate) {
  if (daysSinceLastUpdate <= 0) return signals;
  let newRecency = Math.exp(-daysSinceLastUpdate / 30), newImportance = signals.importance * 0.995 ** daysSinceLastUpdate;
  return {
    ...signals,
    importance: Math.max(0, newImportance),
    recency: newRecency
  };
}
function determineTier(importance, currentTier) {
  return importance >= 85 ? "core" : importance >= 65 && currentTier === "draft" || currentTier === "core" && importance < 60 ? "validated" : currentTier === "validated" && importance < 35 ? "draft" : currentTier;
}
function recordAccessHits(signals, hitCount) {
  return hitCount <= 0 ? signals : {
    ...signals,
    accessCount: signals.accessCount + hitCount,
    importance: Math.min(
      100,
      signals.importance + 3 * hitCount
    )
  };
}
function recordCurateUpdate(signals) {
  return {
    ...signals,
    importance: Math.min(100, signals.importance + 5),
    recency: 1,
    updateCount: signals.updateCount + 1
  };
}
function mergeScoring(source, target) {
  let tierRank = {
    core: 3,
    draft: 1,
    validated: 2
  }, higherTier = tierRank[source.maturity] >= tierRank[target.maturity] ? source.maturity : target.maturity;
  return {
    accessCount: source.accessCount + target.accessCount,
    importance: Math.max(source.importance, target.importance),
    maturity: higherTier,
    recency: Math.max(source.recency, target.recency),
    updateCount: source.updateCount + target.updateCount + 1
  };
}

// ../../packages/core/src/scoring/runtime-signals.ts
var DEFAULT_IMPORTANCE = 50, DEFAULT_RECENCY = 1, DEFAULT_MATURITY = "draft", DEFAULT_ACCESS_COUNT = 0, DEFAULT_UPDATE_COUNT = 0, MaturityTierSchema = external_exports.enum(["core", "draft", "validated"]), RuntimeSignalsSchema = external_exports.object({
  accessCount: external_exports.number().int().nonnegative().default(DEFAULT_ACCESS_COUNT),
  importance: external_exports.number().min(0).max(100).default(DEFAULT_IMPORTANCE),
  maturity: MaturityTierSchema.default(DEFAULT_MATURITY),
  recency: external_exports.number().min(0).max(1).default(DEFAULT_RECENCY),
  updateCount: external_exports.number().int().nonnegative().default(DEFAULT_UPDATE_COUNT)
});
function createDefaultRuntimeSignals() {
  return {
    accessCount: DEFAULT_ACCESS_COUNT,
    importance: DEFAULT_IMPORTANCE,
    maturity: DEFAULT_MATURITY,
    recency: DEFAULT_RECENCY,
    updateCount: DEFAULT_UPDATE_COUNT
  };
}

// ../../packages/core/src/tree/signals.ts
function signalStore(root) {
  return new FileKeyStorage(join4(dirname3(root), "state", "signals"));
}
async function getSignal(root, topicPath) {
  return signalStore(root).get(topicPath);
}
async function getManySignals(root, topicPaths) {
  let store = signalStore(root), out = /* @__PURE__ */ new Map();
  for (let path2 of topicPaths) {
    let signals = await store.get(path2) ?? createDefaultRuntimeSignals();
    out.set(path2, signals);
  }
  return out;
}
async function updateSignal(root, topicPath, update) {
  let store = signalStore(root), current = await store.get(topicPath) ?? createDefaultRuntimeSignals(), next = update(current);
  return await store.set(topicPath, next), next;
}
async function recordUse(root, topicPath, hitCount = 1) {
  return updateSignal(root, topicPath, (current) => {
    let bumped = recordAccessHits(current, hitCount);
    return {
      ...bumped,
      maturity: determineTier(bumped.importance, bumped.maturity)
    };
  });
}
async function deleteSignal(root, topicPath) {
  await signalStore(root).delete(topicPath);
}
async function recordCurateUpdateSignal(root, topicPath) {
  return updateSignal(root, topicPath, (current) => {
    let bumped = recordCurateUpdate(current);
    return {
      ...bumped,
      maturity: determineTier(bumped.importance, bumped.maturity)
    };
  });
}

// ../../packages/core/src/tree/index-generator.ts
import { join as join5 } from "node:path";

// ../../packages/core/src/render/index-elements/validate-index.ts
var BvIndexAttributesSchema = external_exports.object({
  domaincount: external_exports.string().optional(),
  generatedat: external_exports.string().optional(),
  project: external_exports.string().optional(),
  topiccount: external_exports.string().optional()
}).passthrough(), BvIndexDomainAttributesSchema = external_exports.object({
  count: external_exports.string().optional(),
  name: external_exports.string().min(1, { message: "bv-index-domain requires a name" })
}).passthrough(), BvIndexEntryAttributesSchema = external_exports.object({
  format: external_exports.string().optional(),
  path: external_exports.string().min(1, { message: "bv-index-entry requires a path" }),
  title: external_exports.string().optional()
}).passthrough();
function validateHtmlIndex(html) {
  let errors = [], top = parseHtml(html).children.filter(
    (n) => !(n.type === "text" && n.text.trim() === "")
  ), root = top[0];
  if (top.length !== 1 || root === void 0 || root.type !== "element" || root.tagName !== "bv-index")
    return {
      errors: [{ field: "root", message: "index must have a single <bv-index> root" }],
      valid: !1
    };
  collectZod(errors, "bv-index", BvIndexAttributesSchema.safeParse(root.attributes));
  for (let domain of elementChildren(root)) {
    if (domain.tagName !== "bv-index-domain") {
      errors.push({
        field: domain.tagName,
        message: `<bv-index> children must be <bv-index-domain>, got <${domain.tagName}>`
      });
      continue;
    }
    collectZod(
      errors,
      "bv-index-domain",
      BvIndexDomainAttributesSchema.safeParse(domain.attributes)
    );
    for (let entry of elementChildren(domain)) {
      if (entry.tagName !== "bv-index-entry") {
        errors.push({
          field: entry.tagName,
          message: `<bv-index-domain> children must be <bv-index-entry>, got <${entry.tagName}>`
        });
        continue;
      }
      collectZod(
        errors,
        "bv-index-entry",
        BvIndexEntryAttributesSchema.safeParse(entry.attributes)
      );
    }
  }
  return errors.length > 0 ? { errors, valid: !1 } : { valid: !0 };
}
function elementChildren(el) {
  let out = [];
  for (let child of el.children)
    child.type === "element" && out.push(child);
  return out;
}
function collectZod(errors, tag, parsed) {
  if (!parsed.success)
    for (let issue of parsed.error.issues)
      errors.push({
        field: `${tag}.${issue.path.join(".") || "attributes"}`,
        message: issue.message
      });
}

// ../../packages/core/src/tree/index-generator.ts
function escapeText3(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
async function rebuildIndex(root, options = {}) {
  let paths = await listTopics(root), byDomain = /* @__PURE__ */ new Map();
  for (let path2 of paths) {
    let topic = await readTopic(root, path2), domain = path2.includes("/") ? path2.split("/")[0] : "(root)", list = byDomain.get(domain) ?? [];
    list.push({
      path: path2,
      summary: topic.attributes.summary ?? "",
      title: topic.attributes.title ?? path2
    }), byDomain.set(domain, list);
  }
  let now = options.now ?? "", project = options.project ?? "context-tree", domains = [...byDomain.entries()].sort(
    (a, b) => a[0].localeCompare(b[0])
  ), domainXml = domains.map(([name, entries]) => {
    let entryXml = [...entries].sort((a, b) => a.path.localeCompare(b.path)).map(
      (e) => `<bv-index-entry path="${escapeHtmlAttributeValue(e.path)}" title="${escapeHtmlAttributeValue(e.title)}" format="html">${escapeText3(e.summary)}</bv-index-entry>`
    ).join("");
    return `<bv-index-domain name="${escapeHtmlAttributeValue(name)}" count="${entries.length}">${entryXml}</bv-index-domain>`;
  }).join(""), html = `<bv-index project="${escapeHtmlAttributeValue(project)}" generatedat="${escapeHtmlAttributeValue(now)}" topiccount="${paths.length}" domaincount="${domains.length}">${domainXml}</bv-index>`, validation = validateHtmlIndex(html);
  if (!validation.valid)
    throw new Error(
      `generated <bv-index> failed validation: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join("; ")}`
    );
  return await writeFileAtomic(join5(root, INDEX_FILE), html), html;
}

// ../../packages/core/src/tree/manifest.ts
import { createHash as createHash2 } from "node:crypto";
import { readFile as readFile3, stat, writeFile as writeFile2 } from "node:fs/promises";
var MANIFEST_FILE = "_manifest.json", DEFAULT_LANE_BUDGETS = {
  contexts: 4e3,
  summaries: 4e3,
  topics: 16e3
};
function laneFor(type2) {
  return type2 === "summary" ? "summaries" : type2 === "context" ? "contexts" : "topics";
}
async function rebuildManifest(root, options = {}) {
  let budgets = options.budgets ?? DEFAULT_LANE_BUDGETS, fingerprintMode = options.fingerprint ?? "stat", paths = await listTopics(root), signals = await getManySignals(root, paths), byLane = {
    contexts: [],
    summaries: [],
    topics: []
  }, fingerprintParts = [];
  for (let path2 of paths) {
    let topic = await readTopic(root, path2), tokens = estimateTokens(topic.bodyText) + estimateTokens(topic.attributes.summary ?? ""), type2 = topic.attributes.type ?? "topic", lane = laneFor(type2), importance = signals.get(path2)?.importance ?? 50;
    byLane[lane].push({
      importance,
      lane,
      path: path2,
      title: topic.attributes.title ?? path2,
      tokens,
      type: type2
    }), fingerprintParts.push(
      await fingerprintLine(root, path2, signals.get(path2), fingerprintMode)
    );
  }
  let active = [], laneTokens = {
    contexts: 0,
    summaries: 0,
    topics: 0
  };
  for (let lane of ["contexts", "summaries", "topics"]) {
    let budget = budgets[lane], ordered = byLane[lane].sort(
      (a, b) => b.importance - a.importance || a.path.localeCompare(b.path)
    );
    for (let entry of ordered)
      laneTokens[lane] + entry.tokens > budget && laneTokens[lane] > 0 || (laneTokens[lane] += entry.tokens, active.push(entry));
  }
  active.sort((a, b) => a.path.localeCompare(b.path));
  let manifest = {
    active_context: active,
    lane_tokens: laneTokens,
    source_fingerprint: createHash2("sha1").update(fingerprintParts.sort().join(`
`)).digest("hex"),
    source_fingerprint_mode: fingerprintMode,
    total_tokens: laneTokens.contexts + laneTokens.summaries + laneTokens.topics,
    version: 1
  };
  return await writeFile2(
    resolveWithinTree(root, MANIFEST_FILE),
    `${JSON.stringify(manifest, null, "	")}
`,
    "utf8"
  ), manifest;
}
async function fingerprintLine(root, path2, signal, mode) {
  let sig = `${signal?.importance ?? 50} ${signal?.maturity ?? "draft"}`;
  if (mode === "content")
    try {
      let content = await readFile3(resolveWithinTree(root, path2), "utf8");
      return `${path2} ${canonicalTopicHash(content)} ${sig}`;
    } catch {
      return `${path2} ? ${sig}`;
    }
  try {
    let s = await stat(resolveWithinTree(root, path2));
    return `${path2} ${s.mtimeMs} ${s.size} ${sig}`;
  } catch {
    return `${path2} ? ? ${sig}`;
  }
}

// ../../packages/core/src/reconcile/apply-related-changes.ts
import { readFile as readFile4 } from "node:fs/promises";
import { join as join6 } from "node:path";
async function applyRelatedChanges(root, excludePath, apply) {
  let out = {
    marked: [],
    rewritten: [],
    unmarked: [],
    warnings: []
  }, topicPaths = await listTopics(root);
  for (let topicPath of topicPaths)
    if (!(excludePath && topicPath === excludePath))
      try {
        let absPath = join6(root, topicPath), html = await readFile4(absPath, "utf8"), currentValue = (await readHtmlTopic(absPath)).topicAttributes.related, change = apply(currentValue);
        if (change.newValue === void 0) continue;
        let rewritten = change.newValue.length === 0 ? removeBvTopicRootAttributes(html, ["related"]) : patchBvTopicRootAttributes(html, { related: change.newValue });
        if (rewritten === html) continue;
        await writeFileAtomic(absPath, rewritten), change.markedOrphan.length > 0 && out.marked.push({ refs: change.markedOrphan, topicPath }), change.unmarked.length > 0 && out.unmarked.push({ refs: change.unmarked, topicPath });
        for (let r of change.rewritten)
          out.rewritten.push({ ...r, topicPath });
      } catch (err) {
        out.warnings.push(
          `failed to process related on ${topicPath}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
  return out;
}
async function applyRelatedChangesForTopic(root, topicPath, apply) {
  let out = {
    marked: [],
    rewritten: [],
    unmarked: [],
    warnings: []
  };
  try {
    let absPath = join6(root, topicPath), html = await readFile4(absPath, "utf8"), currentValue = (await readHtmlTopic(absPath)).topicAttributes.related, change = apply(currentValue);
    if (change.newValue === void 0) return out;
    let rewritten = change.newValue.length === 0 ? removeBvTopicRootAttributes(html, ["related"]) : patchBvTopicRootAttributes(html, { related: change.newValue });
    if (rewritten === html) return out;
    await writeFileAtomic(absPath, rewritten), change.markedOrphan.length > 0 && out.marked.push({ refs: change.markedOrphan, topicPath }), change.unmarked.length > 0 && out.unmarked.push({ refs: change.unmarked, topicPath });
    for (let r of change.rewritten)
      out.rewritten.push({ ...r, topicPath });
  } catch (err) {
    out.warnings.push(
      `failed to process related on ${topicPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return out;
}

// ../../packages/core/src/reconcile/lock.ts
import { mkdir as mkdir2, open, readFile as readFile5, rm as rm4, stat as stat2 } from "node:fs/promises";
import { dirname as dirname4, join as join7 } from "node:path";
var DEFAULT_TIMEOUT_MS = 5e3, DEFAULT_STALE_AFTER_MS = 3e4, POLL_INTERVAL_MS = 50;
function lockPathFor(root) {
  return join7(dirname4(root), "state", "reconcile", "lock");
}
var ReconcileLockError = class extends Error {
  constructor(message) {
    super(message), this.name = "ReconcileLockError";
  }
};
async function withReconcileLock(root, fn, options = {}) {
  let release = await acquireReconcileLock(root, options);
  try {
    return await fn();
  } finally {
    await release();
  }
}
async function acquireReconcileLock(root, options = {}) {
  let timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS, staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS, lockPath2 = lockPathFor(root);
  await mkdir2(dirname4(lockPath2), { recursive: !0 });
  let deadline = Date.now() + timeoutMs;
  for (; ; ) {
    if (await tryCreateLock(lockPath2))
      return makeReleaseFn(lockPath2);
    if (await isReclaimable(lockPath2, staleAfterMs)) {
      await rm4(lockPath2, { force: !0 }).catch(() => {
      });
      continue;
    }
    if (Date.now() >= deadline)
      throw new ReconcileLockError(
        `Could not acquire reconcile lock at ${lockPath2} within ${timeoutMs}ms`
      );
    await sleep(POLL_INTERVAL_MS);
  }
}
async function tryCreateLock(lockPath2) {
  try {
    let fh = await open(lockPath2, "wx");
    try {
      let record = {
        pid: process.pid,
        startedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      return await fh.write(JSON.stringify(record)), await fh.sync(), !0;
    } finally {
      await fh.close();
    }
  } catch (err) {
    if (err.code === "EEXIST") return !1;
    throw err;
  }
}
async function isReclaimable(lockPath2, _staleAfterMs) {
  if (!await stat2(lockPath2).catch(() => null)) return !0;
  let record = await readLockRecord(lockPath2);
  return record ? record.pid === process.pid ? !1 : !isAlive(record.pid) : !0;
}
async function readLockRecord(lockPath2) {
  try {
    let data = JSON.parse(await readFile5(lockPath2, "utf8"));
    return typeof data.pid == "number" && typeof data.startedAt == "string" ? data : null;
  } catch {
    return null;
  }
}
function isAlive(pid) {
  try {
    return process.kill(pid, 0), !0;
  } catch (err) {
    return err.code === "EPERM";
  }
}
function makeReleaseFn(lockPath2) {
  let released = !1;
  return async () => {
    released || (released = !0, await rm4(lockPath2, { force: !0 }).catch(() => {
    }));
  };
}
function sleep(ms) {
  return new Promise((resolve11) => {
    setTimeout(resolve11, ms);
  });
}

// ../../packages/core/src/reconcile/related-refs.ts
var ORPHAN_MARKER = "?orphan=1";
function parseRelatedAttr(value) {
  if (!value) return [];
  let out = [];
  for (let raw of value.split(",")) {
    let trimmed = raw.trim();
    trimmed.length !== 0 && out.push(parseSingleRef(trimmed));
  }
  return out;
}
function serializeRelatedAttr(refs) {
  return refs.map((r) => r.raw).join(", ");
}
function parseSingleRef(raw) {
  let hasOrphan = raw.endsWith(ORPHAN_MARKER), bareRef = hasOrphan ? raw.slice(0, -ORPHAN_MARKER.length) : raw, targetPath = normalizeTargetPath(bareRef);
  return { bareRef, orphan: hasOrphan, raw, targetPath };
}
function normalizeTargetPath(bareRef) {
  let stripped = bareRef.replace(/^@/, "");
  if (stripped.length === 0 || !/\.html$/i.test(stripped)) return "";
  let segments = stripped.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\.html$/i, "").split("/").filter((s) => s.length > 0);
  return segments.length === 0 || segments.some((s) => s === ".." || s === ".") ? "" : `${segments.join("/")}.html`;
}
function refTargets(ref, targetPath) {
  return ref.targetPath.length > 0 && ref.targetPath === targetPath;
}
function noChange() {
  return { markedOrphan: [], newValue: void 0, rewritten: [], unmarked: [] };
}
function markOrphans(currentValue, orphanedPaths) {
  let refs = parseRelatedAttr(currentValue);
  if (refs.length === 0 || orphanedPaths.size === 0) return noChange();
  let markedOrphan = [], mutated = !1, next = refs.map((ref) => ref.orphan || !orphanedPaths.has(ref.targetPath) ? ref : (mutated = !0, markedOrphan.push(ref.bareRef), {
    ...ref,
    orphan: !0,
    raw: ref.bareRef + ORPHAN_MARKER
  }));
  return mutated ? {
    markedOrphan,
    newValue: serializeRelatedAttr(next),
    rewritten: [],
    unmarked: []
  } : noChange();
}
function unmarkRefs(currentValue, recoveredPaths) {
  let refs = parseRelatedAttr(currentValue);
  if (refs.length === 0 || recoveredPaths.size === 0) return noChange();
  let unmarked = [], mutated = !1, next = refs.map((ref) => !ref.orphan || !recoveredPaths.has(ref.targetPath) ? ref : (mutated = !0, unmarked.push(ref.bareRef), { ...ref, orphan: !1, raw: ref.bareRef }));
  return mutated ? {
    markedOrphan: [],
    newValue: serializeRelatedAttr(next),
    rewritten: [],
    unmarked
  } : noChange();
}
function rewriteRefs(currentValue, fromPath, toPath) {
  if (fromPath === toPath) return noChange();
  let refs = parseRelatedAttr(currentValue);
  if (refs.length === 0) return noChange();
  let rewritten = [], mutated = !1, next = refs.map((ref) => {
    if (ref.targetPath !== fromPath) return ref;
    mutated = !0;
    let newBareRef = renameInRef(ref.bareRef, fromPath, toPath), newRaw = ref.orphan ? newBareRef + ORPHAN_MARKER : newBareRef;
    return rewritten.push({ from: ref.raw, to: newRaw }), {
      ...ref,
      bareRef: newBareRef,
      raw: newRaw,
      targetPath: toPath
    };
  });
  return mutated ? {
    markedOrphan: [],
    newValue: serializeRelatedAttr(next),
    rewritten,
    unmarked: []
  } : noChange();
}
function renameInRef(bareRef, fromPath, toPath) {
  let bareNormalized = bareRef.replace(/^@/, "").replace(/\.html$/i, ""), fromNormalized = fromPath.replace(/\.html$/i, "");
  return bareNormalized !== fromNormalized ? bareRef : `@${toPath}`;
}

// ../../packages/core/src/reconcile/reconciler.ts
var Reconciler = class {
  constructor(root) {
    this.root = root;
  }
  /**
   * Reconcile derived state after a single mutation. Acquires the
   * per-space file lock, dispatches to an op handler, and releases on
   * return or throw.
   */
  async afterMutation(event) {
    return withReconcileLock(this.root, () => this.dispatch(event));
  }
  /**
   * Reconcile a BATCH of mutations under a SINGLE lock acquisition. The desktop
   * watcher maps one OS change-batch to N events; running `afterMutation` per
   * event takes the per-space file lock N times, and under a bulk op (or
   * cross-process contention from a skill CLI holding the lock) the later waiters
   * hit the 5s acquire deadline — the observed `ReconcileLockError` storm. Taking
   * the lock ONCE for the whole batch removes that storm. Each event still
   * dispatches in order, so per-event rename/orphan handling is preserved;
   * results are merged. (A future optimization can also collapse the N derived-
   * state rebuilds into one — here each event still rebuilds, but under one lock.)
   */
  async afterMutations(events) {
    return events.length === 0 ? emptyReconcileResult() : events.length === 1 ? this.afterMutation(events[0]) : withReconcileLock(this.root, async () => {
      let started = nowMs(), merged = emptyReconcileResult();
      for (let event of events)
        mergeReconcileResult(merged, await this.dispatch(event));
      return merged.elapsed_ms = nowMs() - started, merged;
    });
  }
  async dispatch(event) {
    let started = nowMs(), result;
    switch (event.kind) {
      case "delete":
        result = await this.afterDelete(event);
        break;
      case "create":
        result = await this.afterCreate(event);
        break;
      case "rewrite":
        result = await this.afterRewrite(event);
        break;
      case "merge":
        result = await this.afterMerge(event);
        break;
      case "rename":
        result = await this.afterRename(event);
        break;
      default: {
        let _exhaustive = event;
        throw new Error(`Reconciler: unknown MutationKind: ${_exhaustive.kind}`);
      }
    }
    return result.elapsed_ms = nowMs() - started, result;
  }
  /**
   * Full walk + rebuild. Used by `brv reconcile` and as a recovery path
   * when no snapshot is available on cold boot.
   *
   * Strategy: rebuild index + manifest. Skip the per-topic `related` pass
   * (those go through `afterMutation` for each detected drift); callers
   * who want full ref recovery should use `rebindOrphans` instead.
   */
  async reconcileFull() {
    return withReconcileLock(this.root, async () => {
      let started = nowMs(), result = emptyReconcileResult();
      return await this.rebuildIndexAndManifest(result), result.elapsed_ms = nowMs() - started, result;
    });
  }
  /**
   * Recovery command — `brv reconcile --rebind-orphans`. Walks every
   * topic and looks at its orphan-marked `related` refs. For each orphan
   * whose target IS currently on disk (the topic came back somehow:
   * `git pull`, manual restore, etc.), the orphan marker is removed and
   * the ref is rewritten as a normal ref.
   *
   * **v1 limitation:** does not detect renames. If `auth/jwt.html` was
   * renamed to `auth/jwt_v2.html` (and the watcher missed the rename
   * inference at the time), the orphan ref at `@auth/jwt.html?orphan=1`
   * is NOT auto-bound to the new path — we have no `id` history to match
   * by. Users with this scenario need to edit the topic manually OR
   * recreate the old path to coax the un-mark. Future enhancement: store
   * the old `id` in the orphan marker (`?orphan=1&id=tpc_...`) and
   * rebind by id-match against existing topics.
   */
  async rebindOrphans() {
    return withReconcileLock(this.root, async () => {
      let started = nowMs(), result = emptyReconcileResult(), existingPaths = new Set(await listTopics(this.root)), pass = await applyRelatedChanges(
        this.root,
        void 0,
        (currentValue) => unmarkRefs(currentValue, existingPaths)
      );
      return result.related_refs_unmarked = pass.unmarked, result.warnings.push(...pass.warnings), await this.rebuildIndexAndManifest(result), result.elapsed_ms = nowMs() - started, result;
    });
  }
  // ─── per-kind handlers ──────────────────────────────────────────────────
  async afterDelete(event) {
    let result = emptyReconcileResult();
    if (!isFileRelpath(event.path))
      return result.warnings.push(`delete: non-file path "${event.path}" \u2014 skipped`), result;
    try {
      event.preservedSignal !== void 0 ? (await this.writeQuarantineFile(event.path, event.preservedSignal), result.signals_quarantined = 1) : await this.quarantineLiveSignal(event.path) && (result.signals_quarantined = 1);
    } catch (err) {
      result.warnings.push(
        `delete: quarantine signal failed: ${describeError(err)}`
      );
    }
    let pass = await applyRelatedChanges(
      this.root,
      event.path,
      (currentValue) => markOrphans(currentValue, /* @__PURE__ */ new Set([event.path]))
    );
    return result.related_refs_marked_orphan = pass.marked, result.warnings.push(...pass.warnings), await this.rebuildIndexAndManifest(result), result.should_emit_sync_event = event.source !== "sync_inbound", result;
  }
  async afterCreate(event) {
    let result = emptyReconcileResult();
    if (!isFileRelpath(event.path))
      return result.warnings.push(`create: non-file path "${event.path}" \u2014 skipped`), result;
    let pass = await applyRelatedChanges(
      this.root,
      event.path,
      (currentValue) => unmarkRefs(currentValue, /* @__PURE__ */ new Set([event.path]))
    );
    result.related_refs_unmarked = pass.unmarked, result.warnings.push(...pass.warnings);
    let existing = new Set(await listTopics(this.root));
    if (existing.delete(event.path), existing.size > 0) {
      let selfPass = await applyRelatedChangesForTopic(
        this.root,
        event.path,
        (currentValue) => unmarkRefs(currentValue, existing)
      );
      for (let u of selfPass.unmarked)
        result.related_refs_unmarked.push(u);
      result.warnings.push(...selfPass.warnings);
    }
    return await this.rebuildIndexAndManifest(result), result.should_emit_sync_event = event.source !== "sync_inbound", result;
  }
  async afterRewrite(event) {
    let result = emptyReconcileResult(), beforeRelated = event.beforeAttrs?.related, afterRelated = event.afterAttrs?.related;
    return beforeRelated !== afterRelated && result.warnings.push(
      "rewrite: related changed; full ref re-validation deferred to next reconcileFull"
    ), event.beforeAttrs?.title !== event.afterAttrs?.title || event.beforeAttrs?.summary !== event.afterAttrs?.summary || event.beforeAttrs?.tags !== event.afterAttrs?.tags || event.beforeAttrs === void 0 ? await this.rebuildIndexAndManifest(result) : result.manifest_rebuilt = await this.safeRebuildManifest(result), result.should_emit_sync_event = event.source !== "sync_inbound", result;
  }
  async afterMerge(event) {
    let result = emptyReconcileResult(), loserPath = event.loserPath, survivorPath = event.survivorPath ?? event.path;
    if (!loserPath || !isFileRelpath(loserPath))
      return result.warnings.push("merge: missing or non-file loserPath \u2014 skipped"), result;
    if (!isFileRelpath(survivorPath))
      return result.warnings.push(
        "merge: missing or non-file survivorPath \u2014 skipped"
      ), result;
    let pass = await applyRelatedChanges(
      this.root,
      survivorPath,
      (currentValue) => rewriteRefs(currentValue, loserPath, survivorPath)
    );
    result.related_refs_rewritten = pass.rewritten, result.warnings.push(...pass.warnings);
    try {
      event.preservedSignal !== void 0 ? (await this.writeQuarantineFile(loserPath, event.preservedSignal), result.signals_quarantined = 1) : await this.quarantineLiveSignal(loserPath) && (result.signals_quarantined = 1);
    } catch (err) {
      result.warnings.push(
        `merge: quarantine loser signal failed: ${describeError(err)}`
      );
    }
    return await this.rebuildIndexAndManifest(result), result.should_emit_sync_event = event.source !== "sync_inbound", result;
  }
  async afterRename(event) {
    let result = emptyReconcileResult(), oldPath = event.path, newPath = event.newPath;
    if (!oldPath || !newPath || !isFileRelpath(oldPath) || !isFileRelpath(newPath))
      return result.warnings.push("rename: missing or non-file paths \u2014 skipped"), result;
    let pass = await applyRelatedChanges(
      this.root,
      newPath,
      (currentValue) => rewriteRefs(currentValue, oldPath, newPath)
    );
    result.related_refs_rewritten = pass.rewritten, result.warnings.push(...pass.warnings);
    try {
      await this.moveSignalSidecar(oldPath, newPath);
    } catch (err) {
      result.warnings.push(
        `rename: move signal failed: ${describeError(err)}`
      );
    }
    return await this.rebuildIndexAndManifest(result), result.should_emit_sync_event = event.source !== "sync_inbound", result;
  }
  // ─── helpers ────────────────────────────────────────────────────────────
  async rebuildIndexAndManifest(result) {
    try {
      await rebuildIndex(this.root, { now: (/* @__PURE__ */ new Date()).toISOString() }), result.index_rebuilt = !0;
    } catch (err) {
      result.warnings.push(`rebuildIndex failed: ${describeError(err)}`);
    }
    result.manifest_rebuilt = await this.safeRebuildManifest(result);
  }
  async safeRebuildManifest(result) {
    try {
      return await rebuildManifest(this.root), !0;
    } catch (err) {
      return result.warnings.push(`rebuildManifest failed: ${describeError(err)}`), !1;
    }
  }
  /**
   * Try to quarantine a still-live signal sidecar. Returns `true` if a
   * signal was found on disk and moved to the quarantine dir, `false` if
   * none existed (the common case after `applyDelete` / `applyMerge`
   * have run, since they wipe the signal themselves — for skill-driven
   * deletes use `preservedSignal` instead, see Codex PR #93).
   *
   * Quarantine path: `<state-dir>/orphan-signals/<timestamp>-<flat>.json`.
   */
  async quarantineLiveSignal(topicPath) {
    let store = signalStore(this.root), current = await store.get(topicPath);
    return current === void 0 ? !1 : (await store.delete(topicPath), await this.writeQuarantineFile(topicPath, current), !0);
  }
  /**
   * Write a signal record to the orphan quarantine dir. Caller has
   * already obtained the value (either via `quarantineLiveSignal` or by
   * receiving `preservedSignal` from the skill).
   */
  async writeQuarantineFile(topicPath, signal) {
    let orphanDir = join8(dirname5(this.root), "state", "orphan-signals");
    await mkdir3(orphanDir, { recursive: !0 });
    let stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-"), flat = topicPath.replace(/[/\\]/g, "_"), key = `${stamp}-${flat}`;
    await writeFile3(
      join8(orphanDir, `${key}.json`),
      JSON.stringify(signal, null, 2),
      "utf8"
    );
  }
  /**
   * Move the signal sidecar to follow a renamed topic. Returns `true` iff a
   * sidecar was actually moved (the topic had signals to preserve).
   */
  async moveSignalSidecar(oldPath, newPath) {
    let store = signalStore(this.root), current = await store.get(oldPath);
    return current === void 0 ? !1 : (await store.delete(oldPath), await store.set(newPath, current), !0);
  }
};
function mergeReconcileResult(into, from) {
  into.index_rebuilt ||= from.index_rebuilt, into.manifest_rebuilt ||= from.manifest_rebuilt, into.search_index_updated ||= from.search_index_updated, into.related_refs_marked_orphan.push(...from.related_refs_marked_orphan), into.related_refs_unmarked.push(...from.related_refs_unmarked), into.related_refs_rewritten.push(...from.related_refs_rewritten), into.signals_quarantined += from.signals_quarantined, into.signals_restored += from.signals_restored, into.should_emit_sync_event ||= from.should_emit_sync_event, into.warnings.push(...from.warnings);
}
function isFileRelpath(p) {
  return /\.html$/i.test(p) && !p.includes("..") && p.length > 0;
}
function describeError(err) {
  return err instanceof Error ? err.message : String(err);
}
function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

// ../../packages/core/src/identity/project-path-hash.ts
import { createHash as createHash3 } from "node:crypto";
import { resolve as resolve3 } from "node:path";
function projectPathHash(absPath) {
  return createHash3("sha256").update(resolve3(absPath)).digest("hex");
}

// ../../node_modules/.pnpm/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs
function isNothing(subject) {
  return typeof subject > "u" || subject === null;
}
function isObject(subject) {
  return typeof subject == "object" && subject !== null;
}
function toArray(sequence) {
  return Array.isArray(sequence) ? sequence : isNothing(sequence) ? [] : [sequence];
}
function extend(target, source) {
  var index, length, key, sourceKeys;
  if (source)
    for (sourceKeys = Object.keys(source), index = 0, length = sourceKeys.length; index < length; index += 1)
      key = sourceKeys[index], target[key] = source[key];
  return target;
}
function repeat(string, count) {
  var result = "", cycle;
  for (cycle = 0; cycle < count; cycle += 1)
    result += string;
  return result;
}
function isNegativeZero(number) {
  return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
var isNothing_1 = isNothing, isObject_1 = isObject, toArray_1 = toArray, repeat_1 = repeat, isNegativeZero_1 = isNegativeZero, extend_1 = extend, common = {
  isNothing: isNothing_1,
  isObject: isObject_1,
  toArray: toArray_1,
  repeat: repeat_1,
  isNegativeZero: isNegativeZero_1,
  extend: extend_1
};
function formatError(exception2, compact) {
  var where = "", message = exception2.reason || "(unknown reason)";
  return exception2.mark ? (exception2.mark.name && (where += 'in "' + exception2.mark.name + '" '), where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")", !compact && exception2.mark.snippet && (where += `

` + exception2.mark.snippet), message + " " + where) : message;
}
function YAMLException$1(reason, mark) {
  Error.call(this), this.name = "YAMLException", this.reason = reason, this.mark = mark, this.message = formatError(this, !1), Error.captureStackTrace ? Error.captureStackTrace(this, this.constructor) : this.stack = new Error().stack || "";
}
YAMLException$1.prototype = Object.create(Error.prototype);
YAMLException$1.prototype.constructor = YAMLException$1;
YAMLException$1.prototype.toString = function(compact) {
  return this.name + ": " + formatError(this, compact);
};
var exception = YAMLException$1;
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = "", tail = "", maxHalfLength = Math.floor(maxLineLength / 2) - 1;
  return position - lineStart > maxHalfLength && (head = " ... ", lineStart = position - maxHalfLength + head.length), lineEnd - position > maxHalfLength && (tail = " ...", lineEnd = position + maxHalfLength - tail.length), {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
    pos: position - lineStart + head.length
    // relative position
  };
}
function padStart(string, max) {
  return common.repeat(" ", max - string.length) + string;
}
function makeSnippet(mark, options) {
  if (options = Object.create(options || null), !mark.buffer) return null;
  options.maxLength || (options.maxLength = 79), typeof options.indent != "number" && (options.indent = 1), typeof options.linesBefore != "number" && (options.linesBefore = 3), typeof options.linesAfter != "number" && (options.linesAfter = 2);
  for (var re = /\r?\n|\r|\0/g, lineStarts = [0], lineEnds = [], match, foundLineNo = -1; match = re.exec(mark.buffer); )
    lineEnds.push(match.index), lineStarts.push(match.index + match[0].length), mark.position <= match.index && foundLineNo < 0 && (foundLineNo = lineStarts.length - 2);
  foundLineNo < 0 && (foundLineNo = lineStarts.length - 1);
  var result = "", i, line, lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length, maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
  for (i = 1; i <= options.linesBefore && !(foundLineNo - i < 0); i++)
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo - i],
      lineEnds[foundLineNo - i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
      maxLineLength
    ), result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + `
` + result;
  for (line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength), result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + `
`, result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + `^
`, i = 1; i <= options.linesAfter && !(foundLineNo + i >= lineEnds.length); i++)
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo + i],
      lineEnds[foundLineNo + i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
      maxLineLength
    ), result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + `
`;
  return result.replace(/\n$/, "");
}
var snippet = makeSnippet, TYPE_CONSTRUCTOR_OPTIONS = [
  "kind",
  "multi",
  "resolve",
  "construct",
  "instanceOf",
  "predicate",
  "represent",
  "representName",
  "defaultStyle",
  "styleAliases"
], YAML_NODE_KINDS = [
  "scalar",
  "sequence",
  "mapping"
];
function compileStyleAliases(map2) {
  var result = {};
  return map2 !== null && Object.keys(map2).forEach(function(style) {
    map2[style].forEach(function(alias) {
      result[String(alias)] = style;
    });
  }), result;
}
function Type$1(tag, options) {
  if (options = options || {}, Object.keys(options).forEach(function(name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1)
      throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
  }), this.options = options, this.tag = tag, this.kind = options.kind || null, this.resolve = options.resolve || function() {
    return !0;
  }, this.construct = options.construct || function(data) {
    return data;
  }, this.instanceOf = options.instanceOf || null, this.predicate = options.predicate || null, this.represent = options.represent || null, this.representName = options.representName || null, this.defaultStyle = options.defaultStyle || null, this.multi = options.multi || !1, this.styleAliases = compileStyleAliases(options.styleAliases || null), YAML_NODE_KINDS.indexOf(this.kind) === -1)
    throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
}
var type = Type$1;
function compileList(schema2, name) {
  var result = [];
  return schema2[name].forEach(function(currentType) {
    var newIndex = result.length;
    result.forEach(function(previousType, previousIndex) {
      previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi && (newIndex = previousIndex);
    }), result[newIndex] = currentType;
  }), result;
}
function compileMap() {
  var result = {
    scalar: {},
    sequence: {},
    mapping: {},
    fallback: {},
    multi: {
      scalar: [],
      sequence: [],
      mapping: [],
      fallback: []
    }
  }, index, length;
  function collectType(type2) {
    type2.multi ? (result.multi[type2.kind].push(type2), result.multi.fallback.push(type2)) : result[type2.kind][type2.tag] = result.fallback[type2.tag] = type2;
  }
  for (index = 0, length = arguments.length; index < length; index += 1)
    arguments[index].forEach(collectType);
  return result;
}
function Schema$1(definition) {
  return this.extend(definition);
}
Schema$1.prototype.extend = function(definition) {
  var implicit = [], explicit = [];
  if (definition instanceof type)
    explicit.push(definition);
  else if (Array.isArray(definition))
    explicit = explicit.concat(definition);
  else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit)))
    definition.implicit && (implicit = implicit.concat(definition.implicit)), definition.explicit && (explicit = explicit.concat(definition.explicit));
  else
    throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
  implicit.forEach(function(type$1) {
    if (!(type$1 instanceof type))
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    if (type$1.loadKind && type$1.loadKind !== "scalar")
      throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
    if (type$1.multi)
      throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
  }), explicit.forEach(function(type$1) {
    if (!(type$1 instanceof type))
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
  });
  var result = Object.create(Schema$1.prototype);
  return result.implicit = (this.implicit || []).concat(implicit), result.explicit = (this.explicit || []).concat(explicit), result.compiledImplicit = compileList(result, "implicit"), result.compiledExplicit = compileList(result, "explicit"), result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit), result;
};
var schema = Schema$1, str = new type("tag:yaml.org,2002:str", {
  kind: "scalar",
  construct: function(data) {
    return data !== null ? data : "";
  }
}), seq = new type("tag:yaml.org,2002:seq", {
  kind: "sequence",
  construct: function(data) {
    return data !== null ? data : [];
  }
}), map = new type("tag:yaml.org,2002:map", {
  kind: "mapping",
  construct: function(data) {
    return data !== null ? data : {};
  }
}), failsafe = new schema({
  explicit: [
    str,
    seq,
    map
  ]
});
function resolveYamlNull(data) {
  if (data === null) return !0;
  var max = data.length;
  return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
}
function constructYamlNull() {
  return null;
}
function isNull(object) {
  return object === null;
}
var _null = new type("tag:yaml.org,2002:null", {
  kind: "scalar",
  resolve: resolveYamlNull,
  construct: constructYamlNull,
  predicate: isNull,
  represent: {
    canonical: function() {
      return "~";
    },
    lowercase: function() {
      return "null";
    },
    uppercase: function() {
      return "NULL";
    },
    camelcase: function() {
      return "Null";
    },
    empty: function() {
      return "";
    }
  },
  defaultStyle: "lowercase"
});
function resolveYamlBoolean(data) {
  if (data === null) return !1;
  var max = data.length;
  return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
}
function constructYamlBoolean(data) {
  return data === "true" || data === "True" || data === "TRUE";
}
function isBoolean(object) {
  return Object.prototype.toString.call(object) === "[object Boolean]";
}
var bool = new type("tag:yaml.org,2002:bool", {
  kind: "scalar",
  resolve: resolveYamlBoolean,
  construct: constructYamlBoolean,
  predicate: isBoolean,
  represent: {
    lowercase: function(object) {
      return object ? "true" : "false";
    },
    uppercase: function(object) {
      return object ? "TRUE" : "FALSE";
    },
    camelcase: function(object) {
      return object ? "True" : "False";
    }
  },
  defaultStyle: "lowercase"
});
function isHexCode(c) {
  return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
}
function isOctCode(c) {
  return 48 <= c && c <= 55;
}
function isDecCode(c) {
  return 48 <= c && c <= 57;
}
function resolveYamlInteger(data) {
  if (data === null) return !1;
  var max = data.length, index = 0, hasDigits = !1, ch;
  if (!max) return !1;
  if (ch = data[index], (ch === "-" || ch === "+") && (ch = data[++index]), ch === "0") {
    if (index + 1 === max) return !0;
    if (ch = data[++index], ch === "b") {
      for (index++; index < max; index++)
        if (ch = data[index], ch !== "_") {
          if (ch !== "0" && ch !== "1") return !1;
          hasDigits = !0;
        }
      return hasDigits && ch !== "_";
    }
    if (ch === "x") {
      for (index++; index < max; index++)
        if (ch = data[index], ch !== "_") {
          if (!isHexCode(data.charCodeAt(index))) return !1;
          hasDigits = !0;
        }
      return hasDigits && ch !== "_";
    }
    if (ch === "o") {
      for (index++; index < max; index++)
        if (ch = data[index], ch !== "_") {
          if (!isOctCode(data.charCodeAt(index))) return !1;
          hasDigits = !0;
        }
      return hasDigits && ch !== "_";
    }
  }
  if (ch === "_") return !1;
  for (; index < max; index++)
    if (ch = data[index], ch !== "_") {
      if (!isDecCode(data.charCodeAt(index)))
        return !1;
      hasDigits = !0;
    }
  return !(!hasDigits || ch === "_");
}
function constructYamlInteger(data) {
  var value = data, sign = 1, ch;
  if (value.indexOf("_") !== -1 && (value = value.replace(/_/g, "")), ch = value[0], (ch === "-" || ch === "+") && (ch === "-" && (sign = -1), value = value.slice(1), ch = value[0]), value === "0") return 0;
  if (ch === "0") {
    if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
    if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
    if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && object % 1 === 0 && !common.isNegativeZero(object);
}
var int = new type("tag:yaml.org,2002:int", {
  kind: "scalar",
  resolve: resolveYamlInteger,
  construct: constructYamlInteger,
  predicate: isInteger,
  represent: {
    binary: function(obj) {
      return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
    },
    octal: function(obj) {
      return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
    },
    decimal: function(obj) {
      return obj.toString(10);
    },
    /* eslint-disable max-len */
    hexadecimal: function(obj) {
      return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
    }
  },
  defaultStyle: "decimal",
  styleAliases: {
    binary: [2, "bin"],
    octal: [8, "oct"],
    decimal: [10, "dec"],
    hexadecimal: [16, "hex"]
  }
}), YAML_FLOAT_PATTERN = new RegExp(
  // 2.5e4, 2.5 and integers
  "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
);
function resolveYamlFloat(data) {
  return !(data === null || !YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data[data.length - 1] === "_");
}
function constructYamlFloat(data) {
  var value, sign;
  return value = data.replace(/_/g, "").toLowerCase(), sign = value[0] === "-" ? -1 : 1, "+-".indexOf(value[0]) >= 0 && (value = value.slice(1)), value === ".inf" ? sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY : value === ".nan" ? NaN : sign * parseFloat(value, 10);
}
var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
function representYamlFloat(object, style) {
  var res;
  if (isNaN(object))
    switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  else if (Number.POSITIVE_INFINITY === object)
    switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  else if (Number.NEGATIVE_INFINITY === object)
    switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  else if (common.isNegativeZero(object))
    return "-0.0";
  return res = object.toString(10), SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
}
var float = new type("tag:yaml.org,2002:float", {
  kind: "scalar",
  resolve: resolveYamlFloat,
  construct: constructYamlFloat,
  predicate: isFloat,
  represent: representYamlFloat,
  defaultStyle: "lowercase"
}), json = failsafe.extend({
  implicit: [
    _null,
    bool,
    int,
    float
  ]
}), core = json, YAML_DATE_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
), YAML_TIMESTAMP_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
);
function resolveYamlTimestamp(data) {
  return data === null ? !1 : YAML_DATE_REGEXP.exec(data) !== null || YAML_TIMESTAMP_REGEXP.exec(data) !== null;
}
function constructYamlTimestamp(data) {
  var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
  if (match = YAML_DATE_REGEXP.exec(data), match === null && (match = YAML_TIMESTAMP_REGEXP.exec(data)), match === null) throw new Error("Date resolve error");
  if (year = +match[1], month = +match[2] - 1, day = +match[3], !match[4])
    return new Date(Date.UTC(year, month, day));
  if (hour = +match[4], minute = +match[5], second = +match[6], match[7]) {
    for (fraction = match[7].slice(0, 3); fraction.length < 3; )
      fraction += "0";
    fraction = +fraction;
  }
  return match[9] && (tz_hour = +match[10], tz_minute = +(match[11] || 0), delta = (tz_hour * 60 + tz_minute) * 6e4, match[9] === "-" && (delta = -delta)), date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction)), delta && date.setTime(date.getTime() - delta), date;
}
function representYamlTimestamp(object) {
  return object.toISOString();
}
var timestamp = new type("tag:yaml.org,2002:timestamp", {
  kind: "scalar",
  resolve: resolveYamlTimestamp,
  construct: constructYamlTimestamp,
  instanceOf: Date,
  represent: representYamlTimestamp
});
function resolveYamlMerge(data) {
  return data === "<<" || data === null;
}
var merge = new type("tag:yaml.org,2002:merge", {
  kind: "scalar",
  resolve: resolveYamlMerge
}), BASE64_MAP = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=
\r`;
function resolveYamlBinary(data) {
  if (data === null) return !1;
  var code, idx, bitlen = 0, max = data.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++)
    if (code = map2.indexOf(data.charAt(idx)), !(code > 64)) {
      if (code < 0) return !1;
      bitlen += 6;
    }
  return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
  var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map2 = BASE64_MAP, bits = 0, result = [];
  for (idx = 0; idx < max; idx++)
    idx % 4 === 0 && idx && (result.push(bits >> 16 & 255), result.push(bits >> 8 & 255), result.push(bits & 255)), bits = bits << 6 | map2.indexOf(input.charAt(idx));
  return tailbits = max % 4 * 6, tailbits === 0 ? (result.push(bits >> 16 & 255), result.push(bits >> 8 & 255), result.push(bits & 255)) : tailbits === 18 ? (result.push(bits >> 10 & 255), result.push(bits >> 2 & 255)) : tailbits === 12 && result.push(bits >> 4 & 255), new Uint8Array(result);
}
function representYamlBinary(object) {
  var result = "", bits = 0, idx, tail, max = object.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++)
    idx % 3 === 0 && idx && (result += map2[bits >> 18 & 63], result += map2[bits >> 12 & 63], result += map2[bits >> 6 & 63], result += map2[bits & 63]), bits = (bits << 8) + object[idx];
  return tail = max % 3, tail === 0 ? (result += map2[bits >> 18 & 63], result += map2[bits >> 12 & 63], result += map2[bits >> 6 & 63], result += map2[bits & 63]) : tail === 2 ? (result += map2[bits >> 10 & 63], result += map2[bits >> 4 & 63], result += map2[bits << 2 & 63], result += map2[64]) : tail === 1 && (result += map2[bits >> 2 & 63], result += map2[bits << 4 & 63], result += map2[64], result += map2[64]), result;
}
function isBinary(obj) {
  return Object.prototype.toString.call(obj) === "[object Uint8Array]";
}
var binary = new type("tag:yaml.org,2002:binary", {
  kind: "scalar",
  resolve: resolveYamlBinary,
  construct: constructYamlBinary,
  predicate: isBinary,
  represent: representYamlBinary
}), _hasOwnProperty$3 = Object.prototype.hasOwnProperty, _toString$2 = Object.prototype.toString;
function resolveYamlOmap(data) {
  if (data === null) return !0;
  var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
  for (index = 0, length = object.length; index < length; index += 1) {
    if (pair = object[index], pairHasKey = !1, _toString$2.call(pair) !== "[object Object]") return !1;
    for (pairKey in pair)
      if (_hasOwnProperty$3.call(pair, pairKey))
        if (!pairHasKey) pairHasKey = !0;
        else return !1;
    if (!pairHasKey) return !1;
    if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
    else return !1;
  }
  return !0;
}
function constructYamlOmap(data) {
  return data !== null ? data : [];
}
var omap = new type("tag:yaml.org,2002:omap", {
  kind: "sequence",
  resolve: resolveYamlOmap,
  construct: constructYamlOmap
}), _toString$1 = Object.prototype.toString;
function resolveYamlPairs(data) {
  if (data === null) return !0;
  var index, length, pair, keys, result, object = data;
  for (result = new Array(object.length), index = 0, length = object.length; index < length; index += 1) {
    if (pair = object[index], _toString$1.call(pair) !== "[object Object]" || (keys = Object.keys(pair), keys.length !== 1)) return !1;
    result[index] = [keys[0], pair[keys[0]]];
  }
  return !0;
}
function constructYamlPairs(data) {
  if (data === null) return [];
  var index, length, pair, keys, result, object = data;
  for (result = new Array(object.length), index = 0, length = object.length; index < length; index += 1)
    pair = object[index], keys = Object.keys(pair), result[index] = [keys[0], pair[keys[0]]];
  return result;
}
var pairs = new type("tag:yaml.org,2002:pairs", {
  kind: "sequence",
  resolve: resolveYamlPairs,
  construct: constructYamlPairs
}), _hasOwnProperty$2 = Object.prototype.hasOwnProperty;
function resolveYamlSet(data) {
  if (data === null) return !0;
  var key, object = data;
  for (key in object)
    if (_hasOwnProperty$2.call(object, key) && object[key] !== null)
      return !1;
  return !0;
}
function constructYamlSet(data) {
  return data !== null ? data : {};
}
var set = new type("tag:yaml.org,2002:set", {
  kind: "mapping",
  resolve: resolveYamlSet,
  construct: constructYamlSet
}), _default = core.extend({
  implicit: [
    timestamp,
    merge
  ],
  explicit: [
    binary,
    omap,
    pairs,
    set
  ]
}), _hasOwnProperty$1 = Object.prototype.hasOwnProperty, CONTEXT_FLOW_IN = 1, CONTEXT_FLOW_OUT = 2, CONTEXT_BLOCK_IN = 3, CONTEXT_BLOCK_OUT = 4, CHOMPING_CLIP = 1, CHOMPING_STRIP = 2, CHOMPING_KEEP = 3, PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/, PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/, PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/, PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i, PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
  return c === 10 || c === 13;
}
function is_WHITE_SPACE(c) {
  return c === 9 || c === 32;
}
function is_WS_OR_EOL(c) {
  return c === 9 || c === 32 || c === 10 || c === 13;
}
function is_FLOW_INDICATOR(c) {
  return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromHexCode(c) {
  var lc;
  return 48 <= c && c <= 57 ? c - 48 : (lc = c | 32, 97 <= lc && lc <= 102 ? lc - 97 + 10 : -1);
}
function escapedHexLen(c) {
  return c === 120 ? 2 : c === 117 ? 4 : c === 85 ? 8 : 0;
}
function fromDecimalCode(c) {
  return 48 <= c && c <= 57 ? c - 48 : -1;
}
function simpleEscapeSequence(c) {
  return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 || c === 9 ? "	" : c === 110 ? `
` : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
}
function charFromCodepoint(c) {
  return c <= 65535 ? String.fromCharCode(c) : String.fromCharCode(
    (c - 65536 >> 10) + 55296,
    (c - 65536 & 1023) + 56320
  );
}
function setProperty(object, key, value) {
  key === "__proto__" ? Object.defineProperty(object, key, {
    configurable: !0,
    enumerable: !0,
    writable: !0,
    value
  }) : object[key] = value;
}
var simpleEscapeCheck = new Array(256), simpleEscapeMap = new Array(256);
for (i = 0; i < 256; i++)
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0, simpleEscapeMap[i] = simpleEscapeSequence(i);
var i;
function State$1(input, options) {
  this.input = input, this.filename = options.filename || null, this.schema = options.schema || _default, this.onWarning = options.onWarning || null, this.legacy = options.legacy || !1, this.json = options.json || !1, this.listener = options.listener || null, this.implicitTypes = this.schema.compiledImplicit, this.typeMap = this.schema.compiledTypeMap, this.length = input.length, this.position = 0, this.line = 0, this.lineStart = 0, this.lineIndent = 0, this.firstTabInLine = -1, this.documents = [];
}
function generateError(state, message) {
  var mark = {
    name: state.filename,
    buffer: state.input.slice(0, -1),
    // omit trailing \0
    position: state.position,
    line: state.line,
    column: state.position - state.lineStart
  };
  return mark.snippet = snippet(mark), new exception(message, mark);
}
function throwError(state, message) {
  throw generateError(state, message);
}
function throwWarning(state, message) {
  state.onWarning && state.onWarning.call(null, generateError(state, message));
}
var directiveHandlers = {
  YAML: function(state, name, args) {
    var match, major, minor;
    state.version !== null && throwError(state, "duplication of %YAML directive"), args.length !== 1 && throwError(state, "YAML directive accepts exactly one argument"), match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]), match === null && throwError(state, "ill-formed argument of the YAML directive"), major = parseInt(match[1], 10), minor = parseInt(match[2], 10), major !== 1 && throwError(state, "unacceptable YAML version of the document"), state.version = args[0], state.checkLineBreaks = minor < 2, minor !== 1 && minor !== 2 && throwWarning(state, "unsupported YAML version of the document");
  },
  TAG: function(state, name, args) {
    var handle, prefix;
    args.length !== 2 && throwError(state, "TAG directive accepts exactly two arguments"), handle = args[0], prefix = args[1], PATTERN_TAG_HANDLE.test(handle) || throwError(state, "ill-formed tag handle (first argument) of the TAG directive"), _hasOwnProperty$1.call(state.tagMap, handle) && throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle'), PATTERN_TAG_URI.test(prefix) || throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
    try {
      prefix = decodeURIComponent(prefix);
    } catch {
      throwError(state, "tag prefix is malformed: " + prefix);
    }
    state.tagMap[handle] = prefix;
  }
};
function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;
  if (start < end) {
    if (_result = state.input.slice(start, end), checkJson)
      for (_position = 0, _length = _result.length; _position < _length; _position += 1)
        _character = _result.charCodeAt(_position), _character === 9 || 32 <= _character && _character <= 1114111 || throwError(state, "expected valid JSON character");
    else PATTERN_NON_PRINTABLE.test(_result) && throwError(state, "the stream contains non-printable characters");
    state.result += _result;
  }
}
function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;
  for (common.isObject(source) || throwError(state, "cannot merge mappings; the provided source object is unacceptable"), sourceKeys = Object.keys(source), index = 0, quantity = sourceKeys.length; index < quantity; index += 1)
    key = sourceKeys[index], _hasOwnProperty$1.call(destination, key) || (setProperty(destination, key, source[key]), overridableKeys[key] = !0);
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
  var index, quantity;
  if (Array.isArray(keyNode))
    for (keyNode = Array.prototype.slice.call(keyNode), index = 0, quantity = keyNode.length; index < quantity; index += 1)
      Array.isArray(keyNode[index]) && throwError(state, "nested arrays are not supported inside keys"), typeof keyNode == "object" && _class(keyNode[index]) === "[object Object]" && (keyNode[index] = "[object Object]");
  if (typeof keyNode == "object" && _class(keyNode) === "[object Object]" && (keyNode = "[object Object]"), keyNode = String(keyNode), _result === null && (_result = {}), keyTag === "tag:yaml.org,2002:merge")
    if (Array.isArray(valueNode))
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1)
        mergeMappings(state, _result, valueNode[index], overridableKeys);
    else
      mergeMappings(state, _result, valueNode, overridableKeys);
  else
    !state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode) && (state.line = startLine || state.line, state.lineStart = startLineStart || state.lineStart, state.position = startPos || state.position, throwError(state, "duplicated mapping key")), setProperty(_result, keyNode, valueNode), delete overridableKeys[keyNode];
  return _result;
}
function readLineBreak(state) {
  var ch;
  ch = state.input.charCodeAt(state.position), ch === 10 ? state.position++ : ch === 13 ? (state.position++, state.input.charCodeAt(state.position) === 10 && state.position++) : throwError(state, "a line break is expected"), state.line += 1, state.lineStart = state.position, state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
  for (var lineBreaks = 0, ch = state.input.charCodeAt(state.position); ch !== 0; ) {
    for (; is_WHITE_SPACE(ch); )
      ch === 9 && state.firstTabInLine === -1 && (state.firstTabInLine = state.position), ch = state.input.charCodeAt(++state.position);
    if (allowComments && ch === 35)
      do
        ch = state.input.charCodeAt(++state.position);
      while (ch !== 10 && ch !== 13 && ch !== 0);
    if (is_EOL(ch))
      for (readLineBreak(state), ch = state.input.charCodeAt(state.position), lineBreaks++, state.lineIndent = 0; ch === 32; )
        state.lineIndent++, ch = state.input.charCodeAt(++state.position);
    else
      break;
  }
  return checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent && throwWarning(state, "deficient indentation"), lineBreaks;
}
function testDocumentSeparator(state) {
  var _position = state.position, ch;
  return ch = state.input.charCodeAt(_position), !!((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2) && (_position += 3, ch = state.input.charCodeAt(_position), ch === 0 || is_WS_OR_EOL(ch)));
}
function writeFoldedLines(state, count) {
  count === 1 ? state.result += " " : count > 1 && (state.result += common.repeat(`
`, count - 1));
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
  if (ch = state.input.charCodeAt(state.position), is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96 || (ch === 63 || ch === 45) && (following = state.input.charCodeAt(state.position + 1), is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)))
    return !1;
  for (state.kind = "scalar", state.result = "", captureStart = captureEnd = state.position, hasPendingContent = !1; ch !== 0; ) {
    if (ch === 58) {
      if (following = state.input.charCodeAt(state.position + 1), is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following))
        break;
    } else if (ch === 35) {
      if (preceding = state.input.charCodeAt(state.position - 1), is_WS_OR_EOL(preceding))
        break;
    } else {
      if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch))
        break;
      if (is_EOL(ch))
        if (_line = state.line, _lineStart = state.lineStart, _lineIndent = state.lineIndent, skipSeparationSpace(state, !1, -1), state.lineIndent >= nodeIndent) {
          hasPendingContent = !0, ch = state.input.charCodeAt(state.position);
          continue;
        } else {
          state.position = captureEnd, state.line = _line, state.lineStart = _lineStart, state.lineIndent = _lineIndent;
          break;
        }
    }
    hasPendingContent && (captureSegment(state, captureStart, captureEnd, !1), writeFoldedLines(state, state.line - _line), captureStart = captureEnd = state.position, hasPendingContent = !1), is_WHITE_SPACE(ch) || (captureEnd = state.position + 1), ch = state.input.charCodeAt(++state.position);
  }
  return captureSegment(state, captureStart, captureEnd, !1), state.result ? !0 : (state.kind = _kind, state.result = _result, !1);
}
function readSingleQuotedScalar(state, nodeIndent) {
  var ch, captureStart, captureEnd;
  if (ch = state.input.charCodeAt(state.position), ch !== 39)
    return !1;
  for (state.kind = "scalar", state.result = "", state.position++, captureStart = captureEnd = state.position; (ch = state.input.charCodeAt(state.position)) !== 0; )
    if (ch === 39)
      if (captureSegment(state, captureStart, state.position, !0), ch = state.input.charCodeAt(++state.position), ch === 39)
        captureStart = state.position, state.position++, captureEnd = state.position;
      else
        return !0;
    else is_EOL(ch) ? (captureSegment(state, captureStart, captureEnd, !0), writeFoldedLines(state, skipSeparationSpace(state, !1, nodeIndent)), captureStart = captureEnd = state.position) : state.position === state.lineStart && testDocumentSeparator(state) ? throwError(state, "unexpected end of the document within a single quoted scalar") : (state.position++, captureEnd = state.position);
  throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
  if (ch = state.input.charCodeAt(state.position), ch !== 34)
    return !1;
  for (state.kind = "scalar", state.result = "", state.position++, captureStart = captureEnd = state.position; (ch = state.input.charCodeAt(state.position)) !== 0; ) {
    if (ch === 34)
      return captureSegment(state, captureStart, state.position, !0), state.position++, !0;
    if (ch === 92) {
      if (captureSegment(state, captureStart, state.position, !0), ch = state.input.charCodeAt(++state.position), is_EOL(ch))
        skipSeparationSpace(state, !1, nodeIndent);
      else if (ch < 256 && simpleEscapeCheck[ch])
        state.result += simpleEscapeMap[ch], state.position++;
      else if ((tmp = escapedHexLen(ch)) > 0) {
        for (hexLength = tmp, hexResult = 0; hexLength > 0; hexLength--)
          ch = state.input.charCodeAt(++state.position), (tmp = fromHexCode(ch)) >= 0 ? hexResult = (hexResult << 4) + tmp : throwError(state, "expected hexadecimal character");
        state.result += charFromCodepoint(hexResult), state.position++;
      } else
        throwError(state, "unknown escape sequence");
      captureStart = captureEnd = state.position;
    } else is_EOL(ch) ? (captureSegment(state, captureStart, captureEnd, !0), writeFoldedLines(state, skipSeparationSpace(state, !1, nodeIndent)), captureStart = captureEnd = state.position) : state.position === state.lineStart && testDocumentSeparator(state) ? throwError(state, "unexpected end of the document within a double quoted scalar") : (state.position++, captureEnd = state.position);
  }
  throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readFlowCollection(state, nodeIndent) {
  var readNext = !0, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
  if (ch = state.input.charCodeAt(state.position), ch === 91)
    terminator = 93, isMapping = !1, _result = [];
  else if (ch === 123)
    terminator = 125, isMapping = !0, _result = {};
  else
    return !1;
  for (state.anchor !== null && (state.anchorMap[state.anchor] = _result), ch = state.input.charCodeAt(++state.position); ch !== 0; ) {
    if (skipSeparationSpace(state, !0, nodeIndent), ch = state.input.charCodeAt(state.position), ch === terminator)
      return state.position++, state.tag = _tag, state.anchor = _anchor, state.kind = isMapping ? "mapping" : "sequence", state.result = _result, !0;
    readNext ? ch === 44 && throwError(state, "expected the node content, but found ','") : throwError(state, "missed comma between flow collection entries"), keyTag = keyNode = valueNode = null, isPair = isExplicitPair = !1, ch === 63 && (following = state.input.charCodeAt(state.position + 1), is_WS_OR_EOL(following) && (isPair = isExplicitPair = !0, state.position++, skipSeparationSpace(state, !0, nodeIndent))), _line = state.line, _lineStart = state.lineStart, _pos = state.position, composeNode(state, nodeIndent, CONTEXT_FLOW_IN, !1, !0), keyTag = state.tag, keyNode = state.result, skipSeparationSpace(state, !0, nodeIndent), ch = state.input.charCodeAt(state.position), (isExplicitPair || state.line === _line) && ch === 58 && (isPair = !0, ch = state.input.charCodeAt(++state.position), skipSeparationSpace(state, !0, nodeIndent), composeNode(state, nodeIndent, CONTEXT_FLOW_IN, !1, !0), valueNode = state.result), isMapping ? storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos) : isPair ? _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos)) : _result.push(keyNode), skipSeparationSpace(state, !0, nodeIndent), ch = state.input.charCodeAt(state.position), ch === 44 ? (readNext = !0, ch = state.input.charCodeAt(++state.position)) : readNext = !1;
  }
  throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockScalar(state, nodeIndent) {
  var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = !1, detectedIndent = !1, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = !1, tmp, ch;
  if (ch = state.input.charCodeAt(state.position), ch === 124)
    folding = !1;
  else if (ch === 62)
    folding = !0;
  else
    return !1;
  for (state.kind = "scalar", state.result = ""; ch !== 0; )
    if (ch = state.input.charCodeAt(++state.position), ch === 43 || ch === 45)
      CHOMPING_CLIP === chomping ? chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP : throwError(state, "repeat of a chomping mode identifier");
    else if ((tmp = fromDecimalCode(ch)) >= 0)
      tmp === 0 ? throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one") : detectedIndent ? throwError(state, "repeat of an indentation width identifier") : (textIndent = nodeIndent + tmp - 1, detectedIndent = !0);
    else
      break;
  if (is_WHITE_SPACE(ch)) {
    do
      ch = state.input.charCodeAt(++state.position);
    while (is_WHITE_SPACE(ch));
    if (ch === 35)
      do
        ch = state.input.charCodeAt(++state.position);
      while (!is_EOL(ch) && ch !== 0);
  }
  for (; ch !== 0; ) {
    for (readLineBreak(state), state.lineIndent = 0, ch = state.input.charCodeAt(state.position); (!detectedIndent || state.lineIndent < textIndent) && ch === 32; )
      state.lineIndent++, ch = state.input.charCodeAt(++state.position);
    if (!detectedIndent && state.lineIndent > textIndent && (textIndent = state.lineIndent), is_EOL(ch)) {
      emptyLines++;
      continue;
    }
    if (state.lineIndent < textIndent) {
      chomping === CHOMPING_KEEP ? state.result += common.repeat(`
`, didReadContent ? 1 + emptyLines : emptyLines) : chomping === CHOMPING_CLIP && didReadContent && (state.result += `
`);
      break;
    }
    for (folding ? is_WHITE_SPACE(ch) ? (atMoreIndented = !0, state.result += common.repeat(`
`, didReadContent ? 1 + emptyLines : emptyLines)) : atMoreIndented ? (atMoreIndented = !1, state.result += common.repeat(`
`, emptyLines + 1)) : emptyLines === 0 ? didReadContent && (state.result += " ") : state.result += common.repeat(`
`, emptyLines) : state.result += common.repeat(`
`, didReadContent ? 1 + emptyLines : emptyLines), didReadContent = !0, detectedIndent = !0, emptyLines = 0, captureStart = state.position; !is_EOL(ch) && ch !== 0; )
      ch = state.input.charCodeAt(++state.position);
    captureSegment(state, captureStart, state.position, !1);
  }
  return !0;
}
function readBlockSequence(state, nodeIndent) {
  var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = !1, ch;
  if (state.firstTabInLine !== -1) return !1;
  for (state.anchor !== null && (state.anchorMap[state.anchor] = _result), ch = state.input.charCodeAt(state.position); ch !== 0 && (state.firstTabInLine !== -1 && (state.position = state.firstTabInLine, throwError(state, "tab characters must not be used in indentation")), !(ch !== 45 || (following = state.input.charCodeAt(state.position + 1), !is_WS_OR_EOL(following)))); ) {
    if (detected = !0, state.position++, skipSeparationSpace(state, !0, -1) && state.lineIndent <= nodeIndent) {
      _result.push(null), ch = state.input.charCodeAt(state.position);
      continue;
    }
    if (_line = state.line, composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, !1, !0), _result.push(state.result), skipSeparationSpace(state, !0, -1), ch = state.input.charCodeAt(state.position), (state.line === _line || state.lineIndent > nodeIndent) && ch !== 0)
      throwError(state, "bad indentation of a sequence entry");
    else if (state.lineIndent < nodeIndent)
      break;
  }
  return detected ? (state.tag = _tag, state.anchor = _anchor, state.kind = "sequence", state.result = _result, !0) : !1;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
  var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = !1, detected = !1, ch;
  if (state.firstTabInLine !== -1) return !1;
  for (state.anchor !== null && (state.anchorMap[state.anchor] = _result), ch = state.input.charCodeAt(state.position); ch !== 0; ) {
    if (!atExplicitKey && state.firstTabInLine !== -1 && (state.position = state.firstTabInLine, throwError(state, "tab characters must not be used in indentation")), following = state.input.charCodeAt(state.position + 1), _line = state.line, (ch === 63 || ch === 58) && is_WS_OR_EOL(following))
      ch === 63 ? (atExplicitKey && (storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos), keyTag = keyNode = valueNode = null), detected = !0, atExplicitKey = !0, allowCompact = !0) : atExplicitKey ? (atExplicitKey = !1, allowCompact = !0) : throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line"), state.position += 1, ch = following;
    else {
      if (_keyLine = state.line, _keyLineStart = state.lineStart, _keyPos = state.position, !composeNode(state, flowIndent, CONTEXT_FLOW_OUT, !1, !0))
        break;
      if (state.line === _line) {
        for (ch = state.input.charCodeAt(state.position); is_WHITE_SPACE(ch); )
          ch = state.input.charCodeAt(++state.position);
        if (ch === 58)
          ch = state.input.charCodeAt(++state.position), is_WS_OR_EOL(ch) || throwError(state, "a whitespace character is expected after the key-value separator within a block mapping"), atExplicitKey && (storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos), keyTag = keyNode = valueNode = null), detected = !0, atExplicitKey = !1, allowCompact = !1, keyTag = state.tag, keyNode = state.result;
        else if (detected)
          throwError(state, "can not read an implicit mapping pair; a colon is missed");
        else
          return state.tag = _tag, state.anchor = _anchor, !0;
      } else if (detected)
        throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
      else
        return state.tag = _tag, state.anchor = _anchor, !0;
    }
    if ((state.line === _line || state.lineIndent > nodeIndent) && (atExplicitKey && (_keyLine = state.line, _keyLineStart = state.lineStart, _keyPos = state.position), composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, !0, allowCompact) && (atExplicitKey ? keyNode = state.result : valueNode = state.result), atExplicitKey || (storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos), keyTag = keyNode = valueNode = null), skipSeparationSpace(state, !0, -1), ch = state.input.charCodeAt(state.position)), (state.line === _line || state.lineIndent > nodeIndent) && ch !== 0)
      throwError(state, "bad indentation of a mapping entry");
    else if (state.lineIndent < nodeIndent)
      break;
  }
  return atExplicitKey && storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos), detected && (state.tag = _tag, state.anchor = _anchor, state.kind = "mapping", state.result = _result), detected;
}
function readTagProperty(state) {
  var _position, isVerbatim = !1, isNamed = !1, tagHandle, tagName, ch;
  if (ch = state.input.charCodeAt(state.position), ch !== 33) return !1;
  if (state.tag !== null && throwError(state, "duplication of a tag property"), ch = state.input.charCodeAt(++state.position), ch === 60 ? (isVerbatim = !0, ch = state.input.charCodeAt(++state.position)) : ch === 33 ? (isNamed = !0, tagHandle = "!!", ch = state.input.charCodeAt(++state.position)) : tagHandle = "!", _position = state.position, isVerbatim) {
    do
      ch = state.input.charCodeAt(++state.position);
    while (ch !== 0 && ch !== 62);
    state.position < state.length ? (tagName = state.input.slice(_position, state.position), ch = state.input.charCodeAt(++state.position)) : throwError(state, "unexpected end of the stream within a verbatim tag");
  } else {
    for (; ch !== 0 && !is_WS_OR_EOL(ch); )
      ch === 33 && (isNamed ? throwError(state, "tag suffix cannot contain exclamation marks") : (tagHandle = state.input.slice(_position - 1, state.position + 1), PATTERN_TAG_HANDLE.test(tagHandle) || throwError(state, "named tag handle cannot contain such characters"), isNamed = !0, _position = state.position + 1)), ch = state.input.charCodeAt(++state.position);
    tagName = state.input.slice(_position, state.position), PATTERN_FLOW_INDICATORS.test(tagName) && throwError(state, "tag suffix cannot contain flow indicator characters");
  }
  tagName && !PATTERN_TAG_URI.test(tagName) && throwError(state, "tag name cannot contain such characters: " + tagName);
  try {
    tagName = decodeURIComponent(tagName);
  } catch {
    throwError(state, "tag name is malformed: " + tagName);
  }
  return isVerbatim ? state.tag = tagName : _hasOwnProperty$1.call(state.tagMap, tagHandle) ? state.tag = state.tagMap[tagHandle] + tagName : tagHandle === "!" ? state.tag = "!" + tagName : tagHandle === "!!" ? state.tag = "tag:yaml.org,2002:" + tagName : throwError(state, 'undeclared tag handle "' + tagHandle + '"'), !0;
}
function readAnchorProperty(state) {
  var _position, ch;
  if (ch = state.input.charCodeAt(state.position), ch !== 38) return !1;
  for (state.anchor !== null && throwError(state, "duplication of an anchor property"), ch = state.input.charCodeAt(++state.position), _position = state.position; ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch); )
    ch = state.input.charCodeAt(++state.position);
  return state.position === _position && throwError(state, "name of an anchor node must contain at least one character"), state.anchor = state.input.slice(_position, state.position), !0;
}
function readAlias(state) {
  var _position, alias, ch;
  if (ch = state.input.charCodeAt(state.position), ch !== 42) return !1;
  for (ch = state.input.charCodeAt(++state.position), _position = state.position; ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch); )
    ch = state.input.charCodeAt(++state.position);
  return state.position === _position && throwError(state, "name of an alias node must contain at least one character"), alias = state.input.slice(_position, state.position), _hasOwnProperty$1.call(state.anchorMap, alias) || throwError(state, 'unidentified alias "' + alias + '"'), state.result = state.anchorMap[alias], skipSeparationSpace(state, !0, -1), !0;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = !1, hasContent = !1, typeIndex, typeQuantity, typeList, type2, flowIndent, blockIndent;
  if (state.listener !== null && state.listener("open", state), state.tag = null, state.anchor = null, state.kind = null, state.result = null, allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext, allowToSeek && skipSeparationSpace(state, !0, -1) && (atNewLine = !0, state.lineIndent > parentIndent ? indentStatus = 1 : state.lineIndent === parentIndent ? indentStatus = 0 : state.lineIndent < parentIndent && (indentStatus = -1)), indentStatus === 1)
    for (; readTagProperty(state) || readAnchorProperty(state); )
      skipSeparationSpace(state, !0, -1) ? (atNewLine = !0, allowBlockCollections = allowBlockStyles, state.lineIndent > parentIndent ? indentStatus = 1 : state.lineIndent === parentIndent ? indentStatus = 0 : state.lineIndent < parentIndent && (indentStatus = -1)) : allowBlockCollections = !1;
  if (allowBlockCollections && (allowBlockCollections = atNewLine || allowCompact), (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) && (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext ? flowIndent = parentIndent : flowIndent = parentIndent + 1, blockIndent = state.position - state.lineStart, indentStatus === 1 ? allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent) ? hasContent = !0 : (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent) ? hasContent = !0 : readAlias(state) ? (hasContent = !0, (state.tag !== null || state.anchor !== null) && throwError(state, "alias node should not have any properties")) : readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext) && (hasContent = !0, state.tag === null && (state.tag = "?")), state.anchor !== null && (state.anchorMap[state.anchor] = state.result)) : indentStatus === 0 && (hasContent = allowBlockCollections && readBlockSequence(state, blockIndent))), state.tag === null)
    state.anchor !== null && (state.anchorMap[state.anchor] = state.result);
  else if (state.tag === "?") {
    for (state.result !== null && state.kind !== "scalar" && throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"'), typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1)
      if (type2 = state.implicitTypes[typeIndex], type2.resolve(state.result)) {
        state.result = type2.construct(state.result), state.tag = type2.tag, state.anchor !== null && (state.anchorMap[state.anchor] = state.result);
        break;
      }
  } else if (state.tag !== "!") {
    if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag))
      type2 = state.typeMap[state.kind || "fallback"][state.tag];
    else
      for (type2 = null, typeList = state.typeMap.multi[state.kind || "fallback"], typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1)
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type2 = typeList[typeIndex];
          break;
        }
    type2 || throwError(state, "unknown tag !<" + state.tag + ">"), state.result !== null && type2.kind !== state.kind && throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"'), type2.resolve(state.result, state.tag) ? (state.result = type2.construct(state.result, state.tag), state.anchor !== null && (state.anchorMap[state.anchor] = state.result)) : throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
  }
  return state.listener !== null && state.listener("close", state), state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
  var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = !1, ch;
  for (state.version = null, state.checkLineBreaks = state.legacy, state.tagMap = /* @__PURE__ */ Object.create(null), state.anchorMap = /* @__PURE__ */ Object.create(null); (ch = state.input.charCodeAt(state.position)) !== 0 && (skipSeparationSpace(state, !0, -1), ch = state.input.charCodeAt(state.position), !(state.lineIndent > 0 || ch !== 37)); ) {
    for (hasDirectives = !0, ch = state.input.charCodeAt(++state.position), _position = state.position; ch !== 0 && !is_WS_OR_EOL(ch); )
      ch = state.input.charCodeAt(++state.position);
    for (directiveName = state.input.slice(_position, state.position), directiveArgs = [], directiveName.length < 1 && throwError(state, "directive name must not be less than one character in length"); ch !== 0; ) {
      for (; is_WHITE_SPACE(ch); )
        ch = state.input.charCodeAt(++state.position);
      if (ch === 35) {
        do
          ch = state.input.charCodeAt(++state.position);
        while (ch !== 0 && !is_EOL(ch));
        break;
      }
      if (is_EOL(ch)) break;
      for (_position = state.position; ch !== 0 && !is_WS_OR_EOL(ch); )
        ch = state.input.charCodeAt(++state.position);
      directiveArgs.push(state.input.slice(_position, state.position));
    }
    ch !== 0 && readLineBreak(state), _hasOwnProperty$1.call(directiveHandlers, directiveName) ? directiveHandlers[directiveName](state, directiveName, directiveArgs) : throwWarning(state, 'unknown document directive "' + directiveName + '"');
  }
  if (skipSeparationSpace(state, !0, -1), state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45 ? (state.position += 3, skipSeparationSpace(state, !0, -1)) : hasDirectives && throwError(state, "directives end mark is expected"), composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, !1, !0), skipSeparationSpace(state, !0, -1), state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position)) && throwWarning(state, "non-ASCII line breaks are interpreted as content"), state.documents.push(state.result), state.position === state.lineStart && testDocumentSeparator(state)) {
    state.input.charCodeAt(state.position) === 46 && (state.position += 3, skipSeparationSpace(state, !0, -1));
    return;
  }
  if (state.position < state.length - 1)
    throwError(state, "end of the stream or a document separator is expected");
  else
    return;
}
function loadDocuments(input, options) {
  input = String(input), options = options || {}, input.length !== 0 && (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13 && (input += `
`), input.charCodeAt(0) === 65279 && (input = input.slice(1)));
  var state = new State$1(input, options), nullpos = input.indexOf("\0");
  for (nullpos !== -1 && (state.position = nullpos, throwError(state, "null byte is not allowed in input")), state.input += "\0"; state.input.charCodeAt(state.position) === 32; )
    state.lineIndent += 1, state.position += 1;
  for (; state.position < state.length - 1; )
    readDocument(state);
  return state.documents;
}
function loadAll$1(input, iterator, options) {
  iterator !== null && typeof iterator == "object" && typeof options > "u" && (options = iterator, iterator = null);
  var documents = loadDocuments(input, options);
  if (typeof iterator != "function")
    return documents;
  for (var index = 0, length = documents.length; index < length; index += 1)
    iterator(documents[index]);
}
function load$1(input, options) {
  var documents = loadDocuments(input, options);
  if (documents.length !== 0) {
    if (documents.length === 1)
      return documents[0];
    throw new exception("expected a single document in the stream, but found more");
  }
}
var loadAll_1 = loadAll$1, load_1 = load$1, loader = {
  loadAll: loadAll_1,
  load: load_1
}, _toString = Object.prototype.toString, _hasOwnProperty = Object.prototype.hasOwnProperty, CHAR_BOM = 65279, CHAR_TAB = 9, CHAR_LINE_FEED = 10, CHAR_CARRIAGE_RETURN = 13, CHAR_SPACE = 32, CHAR_EXCLAMATION = 33, CHAR_DOUBLE_QUOTE = 34, CHAR_SHARP = 35, CHAR_PERCENT = 37, CHAR_AMPERSAND = 38, CHAR_SINGLE_QUOTE = 39, CHAR_ASTERISK = 42, CHAR_COMMA = 44, CHAR_MINUS = 45, CHAR_COLON = 58, CHAR_EQUALS = 61, CHAR_GREATER_THAN = 62, CHAR_QUESTION = 63, CHAR_COMMERCIAL_AT = 64, CHAR_LEFT_SQUARE_BRACKET = 91, CHAR_RIGHT_SQUARE_BRACKET = 93, CHAR_GRAVE_ACCENT = 96, CHAR_LEFT_CURLY_BRACKET = 123, CHAR_VERTICAL_LINE = 124, CHAR_RIGHT_CURLY_BRACKET = 125, ESCAPE_SEQUENCES = {};
ESCAPE_SEQUENCES[0] = "\\0";
ESCAPE_SEQUENCES[7] = "\\a";
ESCAPE_SEQUENCES[8] = "\\b";
ESCAPE_SEQUENCES[9] = "\\t";
ESCAPE_SEQUENCES[10] = "\\n";
ESCAPE_SEQUENCES[11] = "\\v";
ESCAPE_SEQUENCES[12] = "\\f";
ESCAPE_SEQUENCES[13] = "\\r";
ESCAPE_SEQUENCES[27] = "\\e";
ESCAPE_SEQUENCES[34] = '\\"';
ESCAPE_SEQUENCES[92] = "\\\\";
ESCAPE_SEQUENCES[133] = "\\N";
ESCAPE_SEQUENCES[160] = "\\_";
ESCAPE_SEQUENCES[8232] = "\\L";
ESCAPE_SEQUENCES[8233] = "\\P";
var DEPRECATED_BOOLEANS_SYNTAX = [
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "on",
  "On",
  "ON",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "off",
  "Off",
  "OFF"
], DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
function compileStyleMap(schema2, map2) {
  var result, keys, index, length, tag, style, type2;
  if (map2 === null) return {};
  for (result = {}, keys = Object.keys(map2), index = 0, length = keys.length; index < length; index += 1)
    tag = keys[index], style = String(map2[tag]), tag.slice(0, 2) === "!!" && (tag = "tag:yaml.org,2002:" + tag.slice(2)), type2 = schema2.compiledTypeMap.fallback[tag], type2 && _hasOwnProperty.call(type2.styleAliases, style) && (style = type2.styleAliases[style]), result[tag] = style;
  return result;
}
function encodeHex(character) {
  var string, handle, length;
  if (string = character.toString(16).toUpperCase(), character <= 255)
    handle = "x", length = 2;
  else if (character <= 65535)
    handle = "u", length = 4;
  else if (character <= 4294967295)
    handle = "U", length = 8;
  else
    throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
  return "\\" + handle + common.repeat("0", length - string.length) + string;
}
var QUOTING_TYPE_SINGLE = 1, QUOTING_TYPE_DOUBLE = 2;
function State2(options) {
  this.schema = options.schema || _default, this.indent = Math.max(1, options.indent || 2), this.noArrayIndent = options.noArrayIndent || !1, this.skipInvalid = options.skipInvalid || !1, this.flowLevel = common.isNothing(options.flowLevel) ? -1 : options.flowLevel, this.styleMap = compileStyleMap(this.schema, options.styles || null), this.sortKeys = options.sortKeys || !1, this.lineWidth = options.lineWidth || 80, this.noRefs = options.noRefs || !1, this.noCompatMode = options.noCompatMode || !1, this.condenseFlow = options.condenseFlow || !1, this.quotingType = options.quotingType === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE, this.forceQuotes = options.forceQuotes || !1, this.replacer = typeof options.replacer == "function" ? options.replacer : null, this.implicitTypes = this.schema.compiledImplicit, this.explicitTypes = this.schema.compiledExplicit, this.tag = null, this.result = "", this.duplicates = [], this.usedDuplicates = null;
}
function indentString(string, spaces) {
  for (var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length; position < length; )
    next = string.indexOf(`
`, position), next === -1 ? (line = string.slice(position), position = length) : (line = string.slice(position, next + 1), position = next + 1), line.length && line !== `
` && (result += ind), result += line;
  return result;
}
function generateNextLine(state, level) {
  return `
` + common.repeat(" ", state.indent * level);
}
function testImplicitResolving(state, str3) {
  var index, length, type2;
  for (index = 0, length = state.implicitTypes.length; index < length; index += 1)
    if (type2 = state.implicitTypes[index], type2.resolve(str3))
      return !0;
  return !1;
}
function isWhitespace2(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}
function isPrintable(c) {
  return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
  return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c), cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace2(c);
  return (
    // ns-plain-safe
    (inblock ? (
      // c = flow-in
      cIsNsCharOrWhitespace
    ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace2(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
  );
}
function isPlainSafeFirst(c) {
  return isPrintable(c) && c !== CHAR_BOM && !isWhitespace2(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeLast(c) {
  return !isWhitespace2(c) && c !== CHAR_COLON;
}
function codePointAt(string, pos) {
  var first = string.charCodeAt(pos), second;
  return first >= 55296 && first <= 56319 && pos + 1 < string.length && (second = string.charCodeAt(pos + 1), second >= 56320 && second <= 57343) ? (first - 55296) * 1024 + second - 56320 + 65536 : first;
}
function needIndentIndicator(string) {
  var leadingSpaceRe = /^\n* /;
  return leadingSpaceRe.test(string);
}
var STYLE_PLAIN = 1, STYLE_SINGLE = 2, STYLE_LITERAL = 3, STYLE_FOLDED = 4, STYLE_DOUBLE = 5;
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
  var i, char = 0, prevChar = null, hasLineBreak = !1, hasFoldableLine = !1, shouldTrackWidth = lineWidth !== -1, previousLineBreak = -1, plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
  if (singleLineOnly || forceQuotes)
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      if (char = codePointAt(string, i), !isPrintable(char))
        return STYLE_DOUBLE;
      plain = plain && isPlainSafe(char, prevChar, inblock), prevChar = char;
    }
  else {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      if (char = codePointAt(string, i), char === CHAR_LINE_FEED)
        hasLineBreak = !0, shouldTrackWidth && (hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
        i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ", previousLineBreak = i);
      else if (!isPrintable(char))
        return STYLE_DOUBLE;
      plain = plain && isPlainSafe(char, prevChar, inblock), prevChar = char;
    }
    hasFoldableLine = hasFoldableLine || shouldTrackWidth && i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
  }
  return !hasLineBreak && !hasFoldableLine ? plain && !forceQuotes && !testAmbiguousType(string) ? STYLE_PLAIN : quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE : indentPerLevel > 9 && needIndentIndicator(string) ? STYLE_DOUBLE : forceQuotes ? quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE : hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
}
function writeScalar(state, string, level, iskey, inblock) {
  state.dump = (function() {
    if (string.length === 0)
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
    if (!state.noCompatMode && (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)))
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
    var indent = state.indent * Math.max(1, level), lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent), singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
    function testAmbiguity(string2) {
      return testImplicitResolving(state, string2);
    }
    switch (chooseScalarStyle(
      string,
      singleLineOnly,
      state.indent,
      lineWidth,
      testAmbiguity,
      state.quotingType,
      state.forceQuotes && !iskey,
      inblock
    )) {
      case STYLE_PLAIN:
        return string;
      case STYLE_SINGLE:
        return "'" + string.replace(/'/g, "''") + "'";
      case STYLE_LITERAL:
        return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
      case STYLE_FOLDED:
        return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
      case STYLE_DOUBLE:
        return '"' + escapeString(string) + '"';
      default:
        throw new exception("impossible error: invalid scalar style");
    }
  })();
}
function blockHeader(string, indentPerLevel) {
  var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "", clip = string[string.length - 1] === `
`, keep = clip && (string[string.length - 2] === `
` || string === `
`), chomp = keep ? "+" : clip ? "" : "-";
  return indentIndicator + chomp + `
`;
}
function dropEndingNewline(string) {
  return string[string.length - 1] === `
` ? string.slice(0, -1) : string;
}
function foldString(string, width) {
  for (var lineRe = /(\n+)([^\n]*)/g, result = (function() {
    var nextLF = string.indexOf(`
`);
    return nextLF = nextLF !== -1 ? nextLF : string.length, lineRe.lastIndex = nextLF, foldLine(string.slice(0, nextLF), width);
  })(), prevMoreIndented = string[0] === `
` || string[0] === " ", moreIndented, match; match = lineRe.exec(string); ) {
    var prefix = match[1], line = match[2];
    moreIndented = line[0] === " ", result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? `
` : "") + foldLine(line, width), prevMoreIndented = moreIndented;
  }
  return result;
}
function foldLine(line, width) {
  if (line === "" || line[0] === " ") return line;
  for (var breakRe = / [^ ]/g, match, start = 0, end, curr = 0, next = 0, result = ""; match = breakRe.exec(line); )
    next = match.index, next - start > width && (end = curr > start ? curr : next, result += `
` + line.slice(start, end), start = end + 1), curr = next;
  return result += `
`, line.length - start > width && curr > start ? result += line.slice(start, curr) + `
` + line.slice(curr + 1) : result += line.slice(start), result.slice(1);
}
function escapeString(string) {
  for (var result = "", char = 0, escapeSeq, i = 0; i < string.length; char >= 65536 ? i += 2 : i++)
    char = codePointAt(string, i), escapeSeq = ESCAPE_SEQUENCES[char], !escapeSeq && isPrintable(char) ? (result += string[i], char >= 65536 && (result += string[i + 1])) : result += escapeSeq || encodeHex(char);
  return result;
}
function writeFlowSequence(state, level, object) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1)
    value = object[index], state.replacer && (value = state.replacer.call(object, String(index), value)), (writeNode(state, level, value, !1, !1) || typeof value > "u" && writeNode(state, level, null, !1, !1)) && (_result !== "" && (_result += "," + (state.condenseFlow ? "" : " ")), _result += state.dump);
  state.tag = _tag, state.dump = "[" + _result + "]";
}
function writeBlockSequence(state, level, object, compact) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1)
    value = object[index], state.replacer && (value = state.replacer.call(object, String(index), value)), (writeNode(state, level + 1, value, !0, !0, !1, !0) || typeof value > "u" && writeNode(state, level + 1, null, !0, !0, !1, !0)) && ((!compact || _result !== "") && (_result += generateNextLine(state, level)), state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0) ? _result += "-" : _result += "- ", _result += state.dump);
  state.tag = _tag, state.dump = _result || "[]";
}
function writeFlowMapping(state, level, object) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
  for (index = 0, length = objectKeyList.length; index < length; index += 1)
    pairBuffer = "", _result !== "" && (pairBuffer += ", "), state.condenseFlow && (pairBuffer += '"'), objectKey = objectKeyList[index], objectValue = object[objectKey], state.replacer && (objectValue = state.replacer.call(object, objectKey, objectValue)), writeNode(state, level, objectKey, !1, !1) && (state.dump.length > 1024 && (pairBuffer += "? "), pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " "), writeNode(state, level, objectValue, !1, !1) && (pairBuffer += state.dump, _result += pairBuffer));
  state.tag = _tag, state.dump = "{" + _result + "}";
}
function writeBlockMapping(state, level, object, compact) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
  if (state.sortKeys === !0)
    objectKeyList.sort();
  else if (typeof state.sortKeys == "function")
    objectKeyList.sort(state.sortKeys);
  else if (state.sortKeys)
    throw new exception("sortKeys must be a boolean or a function");
  for (index = 0, length = objectKeyList.length; index < length; index += 1)
    pairBuffer = "", (!compact || _result !== "") && (pairBuffer += generateNextLine(state, level)), objectKey = objectKeyList[index], objectValue = object[objectKey], state.replacer && (objectValue = state.replacer.call(object, objectKey, objectValue)), writeNode(state, level + 1, objectKey, !0, !0, !0) && (explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024, explicitPair && (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0) ? pairBuffer += "?" : pairBuffer += "? "), pairBuffer += state.dump, explicitPair && (pairBuffer += generateNextLine(state, level)), writeNode(state, level + 1, objectValue, !0, explicitPair) && (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0) ? pairBuffer += ":" : pairBuffer += ": ", pairBuffer += state.dump, _result += pairBuffer));
  state.tag = _tag, state.dump = _result || "{}";
}
function detectType(state, object, explicit) {
  var _result, typeList, index, length, type2, style;
  for (typeList = explicit ? state.explicitTypes : state.implicitTypes, index = 0, length = typeList.length; index < length; index += 1)
    if (type2 = typeList[index], (type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object == "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
      if (explicit ? type2.multi && type2.representName ? state.tag = type2.representName(object) : state.tag = type2.tag : state.tag = "?", type2.represent) {
        if (style = state.styleMap[type2.tag] || type2.defaultStyle, _toString.call(type2.represent) === "[object Function]")
          _result = type2.represent(object, style);
        else if (_hasOwnProperty.call(type2.represent, style))
          _result = type2.represent[style](object, style);
        else
          throw new exception("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
        state.dump = _result;
      }
      return !0;
    }
  return !1;
}
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
  state.tag = null, state.dump = object, detectType(state, object, !1) || detectType(state, object, !0);
  var type2 = _toString.call(state.dump), inblock = block, tagStr;
  block && (block = state.flowLevel < 0 || state.flowLevel > level);
  var objectOrArray = type2 === "[object Object]" || type2 === "[object Array]", duplicateIndex, duplicate;
  if (objectOrArray && (duplicateIndex = state.duplicates.indexOf(object), duplicate = duplicateIndex !== -1), (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) && (compact = !1), duplicate && state.usedDuplicates[duplicateIndex])
    state.dump = "*ref_" + duplicateIndex;
  else {
    if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex] && (state.usedDuplicates[duplicateIndex] = !0), type2 === "[object Object]")
      block && Object.keys(state.dump).length !== 0 ? (writeBlockMapping(state, level, state.dump, compact), duplicate && (state.dump = "&ref_" + duplicateIndex + state.dump)) : (writeFlowMapping(state, level, state.dump), duplicate && (state.dump = "&ref_" + duplicateIndex + " " + state.dump));
    else if (type2 === "[object Array]")
      block && state.dump.length !== 0 ? (state.noArrayIndent && !isblockseq && level > 0 ? writeBlockSequence(state, level - 1, state.dump, compact) : writeBlockSequence(state, level, state.dump, compact), duplicate && (state.dump = "&ref_" + duplicateIndex + state.dump)) : (writeFlowSequence(state, level, state.dump), duplicate && (state.dump = "&ref_" + duplicateIndex + " " + state.dump));
    else if (type2 === "[object String]")
      state.tag !== "?" && writeScalar(state, state.dump, level, iskey, inblock);
    else {
      if (type2 === "[object Undefined]")
        return !1;
      if (state.skipInvalid) return !1;
      throw new exception("unacceptable kind of an object to dump " + type2);
    }
    state.tag !== null && state.tag !== "?" && (tagStr = encodeURI(
      state.tag[0] === "!" ? state.tag.slice(1) : state.tag
    ).replace(/!/g, "%21"), state.tag[0] === "!" ? tagStr = "!" + tagStr : tagStr.slice(0, 18) === "tag:yaml.org,2002:" ? tagStr = "!!" + tagStr.slice(18) : tagStr = "!<" + tagStr + ">", state.dump = tagStr + " " + state.dump);
  }
  return !0;
}
function getDuplicateReferences(object, state) {
  var objects = [], duplicatesIndexes = [], index, length;
  for (inspectNode(object, objects, duplicatesIndexes), index = 0, length = duplicatesIndexes.length; index < length; index += 1)
    state.duplicates.push(objects[duplicatesIndexes[index]]);
  state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
  var objectKeyList, index, length;
  if (object !== null && typeof object == "object")
    if (index = objects.indexOf(object), index !== -1)
      duplicatesIndexes.indexOf(index) === -1 && duplicatesIndexes.push(index);
    else if (objects.push(object), Array.isArray(object))
      for (index = 0, length = object.length; index < length; index += 1)
        inspectNode(object[index], objects, duplicatesIndexes);
    else
      for (objectKeyList = Object.keys(object), index = 0, length = objectKeyList.length; index < length; index += 1)
        inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
}
function dump$1(input, options) {
  options = options || {};
  var state = new State2(options);
  state.noRefs || getDuplicateReferences(input, state);
  var value = input;
  return state.replacer && (value = state.replacer.call({ "": value }, "", value)), writeNode(state, 0, value, !0, !0) ? state.dump + `
` : "";
}
var dump_1 = dump$1, dumper = {
  dump: dump_1
};
function renamed(from, to) {
  return function() {
    throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
  };
}
var Type = type, Schema = schema, FAILSAFE_SCHEMA = failsafe, JSON_SCHEMA = json, CORE_SCHEMA = core, DEFAULT_SCHEMA = _default, load = loader.load, loadAll = loader.loadAll, dump = dumper.dump, YAMLException = exception, types = {
  binary,
  float,
  map,
  null: _null,
  pairs,
  set,
  timestamp,
  bool,
  int,
  merge,
  omap,
  seq,
  str
}, safeLoad = renamed("safeLoad", "load"), safeLoadAll = renamed("safeLoadAll", "loadAll"), safeDump = renamed("safeDump", "dump"), jsYaml = {
  Type,
  Schema,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  CORE_SCHEMA,
  DEFAULT_SCHEMA,
  load,
  loadAll,
  dump,
  YAMLException,
  types,
  safeLoad,
  safeLoadAll,
  safeDump
};

// ../../packages/core/src/migrate/convert.ts
var FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/, DIAGRAM_TYPES = /* @__PURE__ */ new Set([
  "ascii",
  "dot",
  "graphviz",
  "mermaid",
  "other",
  "plantuml"
]), FACT_CATEGORIES = /* @__PURE__ */ new Set([
  "convention",
  "environment",
  "other",
  "personal",
  "preference",
  "project",
  "team"
]), RAW_CONCEPT_LABELS = /* @__PURE__ */ new Map([
  ["author", "author"],
  ["authors", "author"],
  ["change", "changes"],
  ["changes", "changes"],
  ["file", "files"],
  ["files", "files"],
  ["flow", "flow"],
  ["flows", "flow"],
  ["pattern", "patterns"],
  ["patterns", "patterns"],
  ["task", "task"],
  ["tasks", "task"],
  ["timestamp", "timestamp"],
  ["timestamps", "timestamp"]
]), ORPHAN_H2 = /* @__PURE__ */ new Map([
  ["abstract", "summary"],
  ["architecture", "structure"],
  ["decisions", "decisions"],
  ["dependencies", "dependencies"],
  ["evidence", "facts"],
  ["examples", "examples"],
  ["features", "highlights"],
  ["highlights", "highlights"],
  ["overview", "reason"],
  ["patterns", "patterns"],
  ["purpose", "reason"],
  ["rules", "rules"],
  ["scope", "structure"],
  ["structure", "structure"]
]);
function escapeText4(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function toCommaString(value) {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(",");
  if (typeof value == "string" && value.length > 0) return value;
}
function strField(value) {
  return typeof value == "string" && value.length > 0 ? value : void 0;
}
function dateField(value) {
  if (typeof value == "string" && value.length > 0) return value;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? void 0 : value.toISOString();
}
function deriveTitle(relPath) {
  return (relPath.split("/").pop() ?? relPath).replace(/\.md$/i, "").replace(/[-_]/g, " ");
}
function deriveType(relPath, fmType) {
  if (typeof fmType == "string" && fmType.length > 0) return fmType;
  let base = relPath.split("/").pop() ?? "";
  return base === "_index.md" ? "summary" : base === "context.md" ? "context" : "topic";
}
function relPathToTopicPath(relPath) {
  let segments = relPath.replaceAll("\\", "/").replace(/\.md$/i, "").split("/").filter((s) => s.length > 0);
  for (let segment of segments)
    if (segment === "." || segment === "..")
      throw new Error(`unsafe path segment "${segment}" in ${relPath}`);
  return segments.join("/");
}
function convertMarkdownTopicToHtml(input) {
  let { markdown, relPath } = input, warnings = [], topicPath;
  try {
    topicPath = relPathToTopicPath(relPath);
  } catch (err) {
    return {
      html: "",
      warnings: [`unsafe-topic-path: ${err instanceof Error ? err.message : String(err)}`]
    };
  }
  let { data, body, parseError } = parseFrontmatter(markdown);
  parseError && warnings.push("Frontmatter YAML failed to parse; kept the whole file as body.");
  let fallbackNow = input.now && input.now.length > 0 ? input.now : void 0, createdat = dateField(data.createdAt) ?? dateField(data.createdat) ?? fallbackNow, updatedat = dateField(data.updatedAt) ?? dateField(data.updatedat) ?? fallbackNow, attrs = [
    `path="${escapeHtmlAttributeValue(topicPath)}"`,
    `title="${escapeHtmlAttributeValue(strField(data.title) ?? extractH1Title(body) ?? deriveTitle(relPath))}"`,
    `type="${escapeHtmlAttributeValue(deriveType(relPath, data.type))}"`
  ];
  pushAttr(attrs, "summary", strField(data.summary) ?? strField(data.short_description)), pushAttr(attrs, "tags", toCommaString(data.tags)), pushAttr(attrs, "keywords", toCommaString(data.keywords)), pushAttr(attrs, "related", rewriteRelated(toCommaString(data.related) ?? toCommaString(data.relateds))), pushAttr(attrs, "createdat", createdat), pushAttr(attrs, "updatedat", updatedat);
  let parts = renderBody(body, warnings);
  if (parts.length === 0) {
    let trimmed = body.trim();
    trimmed.length > 0 ? parts.push(`<bv-fact>${escapeText4(trimmed)}</bv-fact>`) : warnings.push("Topic body is empty after frontmatter.");
  }
  let inner = parts.join("");
  return { html: `<bv-topic ${attrs.join(" ")}>${inner}</bv-topic>`, warnings };
}
function pushAttr(attrs, name, value) {
  value !== void 0 && value.length > 0 && attrs.push(`${name}="${escapeHtmlAttributeValue(value)}"`);
}
function rewriteRelated(csv) {
  if (csv === void 0) return;
  let rewritten = csv.split(",").map((s) => s.trim()).filter((s) => s.length > 0).map((s) => s.endsWith(".md") ? `${s.slice(0, -3)}.html` : s);
  return rewritten.length > 0 ? rewritten.join(",") : void 0;
}
function parseFrontmatter(markdown) {
  let match = FRONTMATTER_RE.exec(markdown);
  if (!match) return { body: markdown, data: {}, parseError: !1 };
  try {
    let data = jsYaml.load(match[1] ?? "") ?? {};
    return { body: match[2] ?? "", data, parseError: !1 };
  } catch {
    return { body: markdown, data: {}, parseError: !0 };
  }
}
function extractH1Title(body) {
  for (let line of body.split(`
`)) {
    let m = /^#\s+(.+?)\s*$/.exec(line);
    if (m && m[1]) return m[1].trim();
  }
}
function renderBody(body, warnings) {
  let parts = [], ruleIds = /* @__PURE__ */ new Set(), { preamble, sections } = splitSections(body);
  for (let section of sections) {
    let heading = section.heading.trim(), lower = heading.toLowerCase();
    lower === "reason" ? pushText(parts, "bv-reason", section.body) : lower === "facts" ? emitFacts(parts, section.body, warnings, "Facts") : lower === "raw concept" ? emitRawConcept(parts, section.body, warnings) : lower === "narrative" ? emitNarrative(parts, section.body, ruleIds, warnings) : lower === "relations" ? section.body.trim().length > 0 && warnings.push(
      "dropped-relations-section: related links are taken from the frontmatter related= attribute"
    ) : emitOrphan(parts, heading, section.body, ruleIds, warnings);
  }
  if (parts.length > 0) {
    let pre = preambleAfterTitle(preamble);
    pre.length > 0 && (parts.unshift(`<bv-fact>${escapeText4(pre)}</bv-fact>`), warnings.push(
      `preserved-preamble: ${[...pre].length} chars before the first section kept as <bv-fact>`
    ));
  }
  return parts;
}
function preambleAfterTitle(preamble) {
  let lines = preamble.split(`
`), h1 = lines.findIndex((l) => /^#\s+/.test(l));
  return h1 !== -1 && lines.splice(h1, 1), lines.join(`
`).trim();
}
function splitSections(body) {
  let sections = [], preambleLines = [], current, fence;
  for (let line of body.split(`
`)) {
    let trimmed = line.trimStart(), fenceMatch = /^(```|~~~)/.exec(trimmed);
    if (fenceMatch) {
      let marker = fenceMatch[1];
      fence === void 0 ? fence = marker : trimmed.startsWith(fence) && (fence = void 0);
    }
    if (fence === void 0) {
      let headingMatch = /^##\s+(.+?)\s*$/.exec(line);
      if (headingMatch && headingMatch[1] !== void 0) {
        current && sections.push({ body: current.lines.join(`
`), heading: current.heading }), current = { heading: headingMatch[1], lines: [] };
        continue;
      }
    }
    current ? current.lines.push(line) : preambleLines.push(line);
  }
  return current && sections.push({ body: current.lines.join(`
`), heading: current.heading }), { preamble: preambleLines.join(`
`), sections };
}
function splitSubsections(body) {
  let preambleLines = [], subsections = [], current, fence;
  for (let line of body.split(`
`)) {
    let trimmed = line.trimStart(), fenceMatch = /^(```|~~~)/.exec(trimmed);
    if (fenceMatch) {
      let marker = fenceMatch[1];
      fence === void 0 ? fence = marker : trimmed.startsWith(fence) && (fence = void 0);
    }
    if (fence === void 0) {
      let headingMatch = /^###\s+(.+?)\s*$/.exec(line);
      if (headingMatch && headingMatch[1] !== void 0) {
        current && subsections.push({ body: current.lines.join(`
`), heading: current.heading }), current = { heading: headingMatch[1], lines: [] };
        continue;
      }
    }
    current ? current.lines.push(line) : preambleLines.push(line);
  }
  return current && subsections.push({ body: current.lines.join(`
`), heading: current.heading }), { preamble: preambleLines.join(`
`), subsections };
}
function pushText(parts, tag, text) {
  let trimmed = text.trim();
  trimmed.length > 0 && parts.push(`<${tag}>${escapeText4(trimmed)}</${tag}>`);
}
function stripBullet(line) {
  let m = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(line);
  return m ? m[1] ?? "" : void 0;
}
function bulletItems(body) {
  let items = [];
  for (let line of body.split(`
`)) {
    let content = stripBullet(line);
    if (content === void 0) continue;
    let trimmed = content.trim();
    trimmed.length > 0 && items.push(trimmed);
  }
  return items;
}
function nonBulletProse(body) {
  return body.split(`
`).filter((l) => l.trim().length > 0 && stripBullet(l) === void 0).join(`
`).trim();
}
function preserveStrayProse(parts, body, warnings, label) {
  let prose = nonBulletProse(body);
  prose.length > 0 && (parts.push(`<bv-fact>${escapeText4(prose)}</bv-fact>`), warnings.push(
    `preserved-non-bullet-prose:${label} (${[...prose].length} chars kept as <bv-fact>)`
  ));
}
function emitFacts(parts, body, warnings, label) {
  for (let item of bulletItems(body)) {
    let structured = /^\*\*(.+?)\*\*\s*:\s*(.+?)(?:\s*\[(\w+)\])?$/.exec(item);
    if (structured) {
      let subject = (structured[1] ?? "").trim(), statement = (structured[2] ?? "").trim(), category = normalizeCategory(structured[3]);
      parts.push(factElement(statement, subject, category));
      continue;
    }
    let plain = /^(.+?)(?:\s*\[(\w+)\])?$/.exec(item);
    plain && parts.push(factElement((plain[1] ?? "").trim(), void 0, normalizeCategory(plain[2])));
  }
  preserveStrayProse(parts, body, warnings, label);
}
function factElement(statement, subject, category) {
  let attrParts = [];
  return subject && subject.length > 0 && attrParts.push(` subject="${escapeHtmlAttributeValue(subject)}"`), category && attrParts.push(` category="${category}"`), `<bv-fact${attrParts.join("")}>${escapeText4(statement)}</bv-fact>`;
}
function normalizeCategory(raw) {
  if (raw === void 0) return;
  let lower = raw.toLowerCase();
  return FACT_CATEGORIES.has(lower) ? lower : "other";
}
function emitRawConcept(parts, body, warnings) {
  let { fields, preamble } = splitLabeledFields(body), pre = preamble.trim();
  pre.length > 0 && parts.push(`<bv-fact>${escapeText4(pre)}</bv-fact>`);
  for (let field of fields) {
    let key = RAW_CONCEPT_LABELS.get(field.label.toLowerCase());
    if (key === void 0) {
      let text = field.body.trim(), combined = text.length > 0 ? `${field.label}: ${text}` : field.label;
      parts.push(`<bv-fact>${escapeText4(combined)}</bv-fact>`), warnings.push(`dropped-raw-concept-label:${field.label} (preserved as <bv-fact>)`);
      continue;
    }
    switch (key) {
      case "author": {
        pushText(parts, "bv-author", field.body);
        break;
      }
      case "changes": {
        emitList(parts, "bv-changes", field.body, warnings);
        break;
      }
      case "files": {
        emitList(parts, "bv-files", field.body, warnings);
        break;
      }
      case "flow": {
        pushText(parts, "bv-flow", field.body);
        break;
      }
      case "patterns": {
        emitPatterns(parts, field.body, warnings);
        break;
      }
      case "task": {
        pushText(parts, "bv-task", field.body);
        break;
      }
      case "timestamp": {
        pushText(parts, "bv-timestamp", field.body);
        break;
      }
      default:
        break;
    }
  }
}
function splitLabeledFields(body) {
  let fields = [], preambleLines = [], current;
  for (let line of body.split(`
`)) {
    let m = /^\s*\*\*(.+?)\s*:\s*\*\*\s*(.*)$/.exec(line);
    if (m && m[1] !== void 0) {
      current && fields.push({ body: current.lines.join(`
`), label: current.label }), current = { label: m[1].trim(), lines: [] };
      let rest = (m[2] ?? "").trim();
      rest.length > 0 && current.lines.push(rest);
      continue;
    }
    current ? current.lines.push(line) : preambleLines.push(line);
  }
  return current && fields.push({ body: current.lines.join(`
`), label: current.label }), { fields, preamble: preambleLines.join(`
`) };
}
function emitList(parts, tag, body, warnings) {
  let items = bulletItems(body);
  if (items.length === 0) {
    pushText(parts, tag, body);
    return;
  }
  let lis = items.map((i) => `<li>${escapeText4(i)}</li>`).join("");
  parts.push(`<${tag}>${lis}</${tag}>`), preserveStrayProse(parts, body, warnings, tag);
}
function emitPatterns(parts, body, warnings) {
  for (let item of bulletItems(body)) {
    let m = /^`(.+?)`(?:\s*\(flags:\s*([^)]*)\))?(?:\s*-\s*(.+))?$/.exec(item);
    if (m && m[1] !== void 0) {
      let attrParts = [], flags = (m[2] ?? "").trim(), desc = (m[3] ?? "").trim();
      flags.length > 0 && attrParts.push(` flags="${escapeHtmlAttributeValue(flags)}"`), desc.length > 0 && attrParts.push(` description="${escapeHtmlAttributeValue(desc)}"`), parts.push(`<bv-pattern${attrParts.join("")}>${escapeText4(m[1])}</bv-pattern>`);
    } else
      parts.push(`<bv-pattern>${escapeText4(item)}</bv-pattern>`);
  }
  preserveStrayProse(parts, body, warnings, "Patterns");
}
function emitNarrative(parts, body, ruleIds, warnings) {
  let { preamble, subsections } = splitSubsections(body), pre = preamble.trim();
  pre.length > 0 && (pushText(parts, "bv-structure", pre), warnings.push(
    `preserved-narrative-preamble: ${[...pre].length} chars kept as <bv-structure>`
  ));
  for (let sub of subsections)
    switch (sub.heading.trim().toLowerCase()) {
      case "dependencies": {
        pushText(parts, "bv-dependencies", sub.body);
        break;
      }
      case "diagrams": {
        emitDiagrams(parts, sub.body, warnings);
        break;
      }
      case "examples": {
        pushText(parts, "bv-examples", sub.body);
        break;
      }
      case "features":
      case "highlights": {
        pushText(parts, "bv-highlights", sub.body);
        break;
      }
      case "overview":
      case "structure": {
        pushText(parts, "bv-structure", sub.body);
        break;
      }
      case "rules": {
        emitRules(parts, sub.body, ruleIds, warnings);
        break;
      }
      default: {
        pushText(parts, "bv-structure", sub.body);
        break;
      }
    }
}
function emitRules(parts, body, ruleIds, warnings) {
  for (let item of bulletItems(body)) {
    let severity = inferSeverity(item), id = uniqueId(slugifyRule(item), ruleIds);
    parts.push(
      `<bv-rule severity="${severity}" id="${escapeHtmlAttributeValue(id)}">${escapeText4(item)}</bv-rule>`
    );
  }
  preserveStrayProse(parts, body, warnings, "Rules");
}
function inferSeverity(text) {
  return /\b(MUST|SHALL)\b/.test(text) ? "must" : /\bSHOULD\b/.test(text) ? "should" : "info";
}
function slugifyRule(text) {
  let slug = text.replace(/\b(MUST|SHALL|SHOULD|MAY|INFO)\b/gi, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return slug.length > 0 ? slug : "rule";
}
function uniqueId(base, seen) {
  if (!seen.has(base))
    return seen.add(base), base;
  for (let n = 2; ; n++) {
    let candidate = `${base}-${n}`;
    if (!seen.has(candidate))
      return seen.add(candidate), candidate;
  }
}
function emitDiagrams(parts, body, warnings) {
  let fenceRe = /(```|~~~)(\w*)\n([\s\S]*?)\1/g, m, any = !1;
  for (; (m = fenceRe.exec(body)) !== null; ) {
    any = !0;
    let lang = (m[2] ?? "").toLowerCase(), type2 = DIAGRAM_TYPES.has(lang) ? lang : "other", content = (m[3] ?? "").replace(/\s+$/, "");
    parts.push(`<bv-diagram type="${type2}">${escapeText4(content)}</bv-diagram>`);
  }
  if (!any) {
    pushText(parts, "bv-diagram", body);
    return;
  }
  let outside = body.replace(/(```|~~~)(\w*)\n[\s\S]*?\1/g, "").trim();
  outside.length > 0 && (pushText(parts, "bv-examples", outside), warnings.push(
    `preserved-diagram-prose: ${[...outside].length} chars outside fences kept as <bv-examples>`
  ));
}
function emitDecisions(parts, body, warnings) {
  for (let item of bulletItems(body))
    parts.push(`<bv-decision>${escapeText4(item)}</bv-decision>`);
  preserveStrayProse(parts, body, warnings, "Decisions");
}
function emitOrphan(parts, heading, body, ruleIds, warnings) {
  let strategy = ORPHAN_H2.get(heading.toLowerCase()), trimmed = body.trim();
  if (strategy === void 0) {
    trimmed.length > 0 && (parts.push(`<bv-fact>${escapeText4(trimmed)}</bv-fact>`), warnings.push(
      `dropped-orphan-section:${heading} (${[...trimmed].length} chars preserved as <bv-fact>)`
    ));
    return;
  }
  switch (strategy) {
    case "decisions": {
      emitDecisions(parts, body, warnings);
      break;
    }
    case "dependencies": {
      pushText(parts, "bv-dependencies", body);
      break;
    }
    case "examples": {
      pushText(parts, "bv-examples", body);
      break;
    }
    case "facts": {
      emitFacts(parts, body, warnings, heading);
      break;
    }
    case "highlights": {
      pushText(parts, "bv-highlights", body);
      break;
    }
    case "patterns": {
      for (let item of bulletItems(body))
        parts.push(`<bv-pattern>${escapeText4(item)}</bv-pattern>`);
      preserveStrayProse(parts, body, warnings, "Patterns");
      break;
    }
    case "reason": {
      pushText(parts, "bv-reason", body);
      break;
    }
    case "rules": {
      emitRules(parts, body, ruleIds, warnings);
      break;
    }
    case "structure": {
      pushText(parts, "bv-structure", body);
      break;
    }
    case "summary": {
      pushText(parts, "bv-fact", body);
      break;
    }
    default:
      break;
  }
}

// ../../packages/core/src/migrate/detect.ts
import { readdir as readdir3 } from "node:fs/promises";
import { join as join9, relative as relative2, sep as sep4 } from "node:path";
var INDEX_FILE2 = "index.html";
function normalizeRel2(root, abs) {
  return relative2(root, abs).split(sep4).join("/");
}
async function walk2(root, dir, out) {
  let entries = await readdir3(dir, { withFileTypes: !0 }).catch(
    (err) => {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  );
  for (let entry of entries)
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      await walk2(root, join9(dir, entry.name), out);
    } else if (entry.isFile()) {
      let rel = normalizeRel2(root, join9(dir, entry.name));
      entry.name.endsWith(".md") ? out.md.push(rel) : entry.name.endsWith(".html") && rel !== INDEX_FILE2 && out.html.push(rel);
    }
}
async function needsMigration(root) {
  let out = { md: [], html: [] };
  return await walk2(root, root, out), out.md.sort(), out.html.sort(), {
    html: out.html,
    legacyMd: out.md,
    needsMigration: out.md.length > 0
  };
}

// ../../packages/core/src/migrate/orchestrator.ts
import { existsSync as existsSync2 } from "node:fs";
import { readdir as readdir4, readFile as readFile6, rm as rm6 } from "node:fs/promises";

// ../../packages/core/src/migrate/constants.ts
var MIGRATIONS_DIRNAME = "_migrations", MOVE_MANIFEST_FILE = "_migration_manifest.json";

// ../../packages/core/src/migrate/manifest-schema.ts
var MigrationMoveEntrySchema = external_exports.object({
  archived: external_exports.string(),
  from: external_exports.string(),
  generatedHtml: external_exports.string(),
  to: external_exports.string()
}), MigrationManifestSchema = external_exports.object({
  batchId: external_exports.string(),
  completedAt: external_exports.string(),
  moves: external_exports.array(MigrationMoveEntrySchema),
  startedAt: external_exports.string(),
  version: external_exports.number()
});

// ../../packages/core/src/migrate/migrate-fs.ts
import { copyFile, mkdir as mkdir4, rename as rename2, rm as rm5 } from "node:fs/promises";
import { dirname as dirname6 } from "node:path";
async function moveFile(source, target) {
  await mkdir4(dirname6(target), { recursive: !0 });
  try {
    await rename2(source, target);
  } catch (err) {
    if (err && typeof err == "object" && "code" in err && err.code === "EXDEV")
      try {
        await copyFile(source, target), await rm5(source, { force: !0 });
      } catch (copyErr) {
        throw await rm5(target, { force: !0 }), copyErr;
      }
    else
      throw err;
  }
}
function isSafeBatchSegment(batchId) {
  return batchId.length === 0 || batchId === "." || batchId === ".." ? !1 : !/[\\/]/.test(batchId);
}

// ../../packages/core/src/migrate/orchestrator.ts
var DEFAULT_BATCH_ID = "migration";
function archiveBaseRel(batchId) {
  return `.brv/${MIGRATIONS_DIRNAME}/${batchId}`;
}
async function migrateTree(root, options = {}) {
  let dryRun = options.dryRun ?? !1, now = options.now ?? "", batchId = options.batchId ?? DEFAULT_BATCH_ID;
  if (!isSafeBatchSegment(batchId))
    throw new Error(`unsafe migration batchId: ${batchId}`);
  let archiveBase = resolveWithinTree(root, archiveBaseRel(batchId)), status = await needsMigration(root), report = {
    archiveRoot: void 0,
    batchId,
    converted: [],
    dryRun,
    moves: [],
    skipped: [],
    warnings: []
  };
  if (status.legacyMd.length === 0) return report;
  if (!dryRun && existsSync2(archiveBase))
    throw new Error(
      `migration batch "${batchId}" already exists at ${archiveBase}; run rollback first or choose a new batchId`
    );
  report.archiveRoot = dryRun ? void 0 : archiveBase;
  for (let rel of status.legacyMd) {
    let markdown;
    try {
      markdown = await readFile6(resolveWithinTree(root, rel), "utf8");
    } catch (err) {
      report.skipped.push({
        path: rel,
        reason: `read-failed: ${err instanceof Error ? err.message : String(err)}`
      });
      continue;
    }
    let { html, warnings } = convertMarkdownTopicToHtml({
      markdown,
      now: options.now,
      relPath: rel
    }), validation = validateHtmlTopic(html);
    if (!validation.ok) {
      report.skipped.push({
        path: rel,
        reason: validation.errors.map((e) => e.message).join("; ")
      });
      continue;
    }
    let toRel = rel.replace(/\.md$/i, ".html"), toAbs = resolveWithinTree(root, toRel);
    if (existsSync2(toAbs)) {
      report.skipped.push({
        path: rel,
        reason: `target "${toRel}" already exists; not overwriting (resolve manually)`
      });
      continue;
    }
    if (report.converted.push({ from: rel, to: toRel }), warnings.length > 0 && report.warnings.push({ path: rel, warnings }), dryRun) continue;
    try {
      await writeFileAtomic(toAbs, html);
    } catch (err) {
      report.converted.pop(), report.skipped.push({
        path: rel,
        reason: `write-failed: ${err instanceof Error ? err.message : String(err)}`
      });
      continue;
    }
    let archivedRel = `${archiveBaseRel(batchId)}/${rel}`, archivedAbs = resolveWithinTree(root, archivedRel);
    try {
      await moveFile(resolveWithinTree(root, rel), archivedAbs);
    } catch (err) {
      try {
        await rm6(toAbs, { force: !0 });
      } catch {
      }
      report.converted.pop(), report.skipped.push({
        path: rel,
        reason: `archive-move-failed: ${err instanceof Error ? err.message : String(err)}`
      });
      continue;
    }
    report.moves.push({
      archived: archivedRel,
      from: rel,
      generatedHtml: toRel,
      to: toRel
    });
  }
  if (!dryRun && report.moves.length > 0) {
    let manifest = {
      batchId,
      completedAt: now,
      moves: report.moves,
      startedAt: now,
      version: 1
    };
    await writeFileAtomic(
      resolveWithinTree(root, `${archiveBaseRel(batchId)}/${MOVE_MANIFEST_FILE}`),
      `${JSON.stringify(manifest, null, 2)}
`
    );
  }
  return report;
}
async function rollback(root, options = {}) {
  let dryRun = options.dryRun ?? !1, migrationsDir = resolveWithinTree(root, `.brv/${MIGRATIONS_DIRNAME}`), batchId = await resolveBatchId(migrationsDir, options.batchId), archiveBase = resolveWithinTree(root, archiveBaseRel(batchId));
  if (!existsSync2(archiveBase))
    throw new Error(`no migration batch "${batchId}" to roll back at ${archiveBase}`);
  let warnings = [], { moves, manifestMissing } = await loadMoves(root, batchId, archiveBase);
  manifestMissing && warnings.push(
    "move manifest missing/invalid; restored .md from the archive scan and left generated .html in place"
  );
  let report = {
    archiveRoot: archiveBase,
    batchId,
    deletedHtml: [],
    dryRun,
    restored: 0,
    skippedHtml: [],
    warnings
  }, ordered = [...moves].sort((a, b) => a.from.localeCompare(b.from)), conflicts = 0;
  for (let move of ordered) {
    let archivedAbs = resolveWithinTree(root, move.archived), targetAbs = resolveWithinTree(root, move.from);
    if (existsSync2(targetAbs) && existsSync2(archivedAbs)) {
      warnings.push(
        `cannot restore ${move.from}: a file already exists at the destination`
      ), conflicts++;
      continue;
    }
    !existsSync2(targetAbs) && existsSync2(archivedAbs) && (dryRun || await moveFile(archivedAbs, targetAbs), report.restored++);
    let htmlAbs = resolveWithinTree(root, move.generatedHtml);
    manifestMissing ? existsSync2(htmlAbs) && report.skippedHtml.push(move.generatedHtml) : existsSync2(htmlAbs) && (dryRun || await rm6(htmlAbs, { force: !0 }), report.deletedHtml.push(move.generatedHtml));
  }
  return dryRun || (conflicts === 0 ? await rm6(archiveBase, { force: !0, recursive: !0 }) : warnings.push(
    `kept archive at ${archiveBase}: ${conflicts} restore conflict(s) remain \u2014 resolve them and re-run rollback`
  )), report;
}
async function resolveBatchId(migrationsDir, explicit) {
  if (explicit !== void 0) {
    if (!isSafeBatchSegment(explicit))
      throw new Error(`unsafe migration batchId: ${explicit}`);
    return explicit;
  }
  let latest = (await readdir4(migrationsDir, { withFileTypes: !0 }).catch(
    (err) => {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  )).filter((e) => e.isDirectory()).map((e) => e.name).sort().at(-1);
  if (latest === void 0)
    throw new Error(`no migration batches to roll back at ${migrationsDir}`);
  return latest;
}
async function loadMoves(root, batchId, archiveBase) {
  let manifestAbs = resolveWithinTree(
    root,
    `${archiveBaseRel(batchId)}/${MOVE_MANIFEST_FILE}`
  );
  try {
    let parsed = MigrationManifestSchema.safeParse(
      JSON.parse(await readFile6(manifestAbs, "utf8"))
    );
    if (parsed.success && parsed.data.moves.length > 0)
      return { manifestMissing: !1, moves: parsed.data.moves };
  } catch {
  }
  return { manifestMissing: !0, moves: await scanArchivedMd(archiveBase, archiveBaseRel(batchId)) };
}
async function scanArchivedMd(archiveBase, archivePrefixRel) {
  let out = [];
  async function walk3(dir, relUnderArchive) {
    let entries = await readdir4(dir, { withFileTypes: !0 }).catch(
      (err) => {
        if (err.code === "ENOENT") return [];
        throw err;
      }
    );
    for (let entry of entries) {
      let childRel = relUnderArchive ? `${relUnderArchive}/${entry.name}` : entry.name;
      if (entry.isDirectory())
        await walk3(`${dir}/${entry.name}`, childRel);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        let to = childRel.replace(/\.md$/i, ".html");
        out.push({
          archived: `${archivePrefixRel}/${childRel}`,
          from: childRel,
          generatedHtml: to,
          to
        });
      }
    }
  }
  return await walk3(archiveBase, ""), out.sort((a, b) => a.from.localeCompare(b.from));
}

// ../../packages/core/src/tree/bindings-registry.ts
import { randomBytes as randomBytes2 } from "node:crypto";
import {
  chmod as chmod2,
  lstat,
  mkdir as mkdir5,
  open as open2,
  readFile as readFile7,
  rename as rename3,
  rm as rm7
} from "node:fs/promises";
import { join as join10, resolve as resolve4, sep as sep5 } from "node:path";
var BINDINGS_FILENAME = "bindings.json";
function bindingsDir() {
  return getGlobalDataDir();
}
function bindingsPath() {
  return join10(bindingsDir(), BINDINGS_FILENAME);
}
var LOCK_STALE_MS = 3e4, LOCK_RETRY_MS = 20, MalformedRegistryError = class extends Error {
  constructor(message) {
    super(message), this.name = "MalformedRegistryError";
  }
};
function emptyRegistryDocument() {
  return { bindings: [], deletedSpaces: [] };
}
function emptyRegistry() {
  return { bindings: [], deletedSpaces: [] };
}
function isBinding(value) {
  if (typeof value != "object" || value === null) return !1;
  let v = value;
  return typeof v.folder == "string" && isUuid(v.space_id) && typeof v.addedAt == "string" && (v.removedAt === void 0 || typeof v.removedAt == "string");
}
function isDeletedSpace(value) {
  if (typeof value != "object" || value === null) return !1;
  let v = value;
  return isUuid(v.space_id) && typeof v.deletedAt == "string" && typeof v.hard == "boolean";
}
function normalizeRegistryDocument(obj) {
  let bindings = Array.isArray(obj.bindings) ? obj.bindings.filter((v) => isBinding(v)) : [], deletedSpaces = Array.isArray(obj.deletedSpaces) ? obj.deletedSpaces.filter((v) => isDeletedSpace(v)) : [], doc = { ...obj, bindings, deletedSpaces };
  return isUuid(obj.defaultSpaceId) ? doc.defaultSpaceId = obj.defaultSpaceId : delete doc.defaultSpaceId, doc;
}
function assertRegistryDocumentForMutation(obj) {
  if (obj.bindings !== void 0 && !Array.isArray(obj.bindings))
    throw new MalformedRegistryError("bindings registry is malformed");
  if (obj.deletedSpaces !== void 0 && !Array.isArray(obj.deletedSpaces))
    throw new MalformedRegistryError("bindings registry is malformed");
  if (obj.defaultSpaceId !== void 0 && !isUuid(obj.defaultSpaceId))
    throw new MalformedRegistryError("bindings registry is malformed");
  if (Array.isArray(obj.bindings) && !obj.bindings.every(isBinding))
    throw new MalformedRegistryError("bindings registry is malformed");
  if (Array.isArray(obj.deletedSpaces) && !obj.deletedSpaces.every(isDeletedSpace))
    throw new MalformedRegistryError("bindings registry is malformed");
}
async function readRegistryDocumentForMutation() {
  let raw;
  try {
    raw = await readFile7(bindingsPath(), "utf8");
  } catch (err) {
    if (isErrnoCode(err, "ENOENT")) return emptyRegistryDocument();
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new MalformedRegistryError(
      `bindings registry is malformed: ${err.message}`
    );
  }
  if (typeof parsed != "object" || parsed === null || Array.isArray(parsed))
    throw new MalformedRegistryError("bindings registry is malformed");
  return assertRegistryDocumentForMutation(parsed), normalizeRegistryDocument(parsed);
}
async function ensurePrivateBindingsDir() {
  await mkdir5(bindingsDir(), { recursive: !0, mode: 448 }), await chmod2(bindingsDir(), 448);
}
function lockPath() {
  return join10(bindingsDir(), `${BINDINGS_FILENAME}.lock`);
}
function tempPath() {
  return join10(
    bindingsDir(),
    `${BINDINGS_FILENAME}.tmp.${process.pid}.${randomBytes2(8).toString("hex")}`
  );
}
async function delay(ms) {
  await new Promise((resolve11) => setTimeout(resolve11, ms));
}
async function withRegistryLock(fn) {
  await ensurePrivateBindingsDir();
  let lock = lockPath();
  for (; ; )
    try {
      let handle = await open2(lock, "wx", 384);
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, createdAt: Date.now() })
      ), await handle.close();
      break;
    } catch (err) {
      if (!isErrnoCode(err, "EEXIST")) throw err;
      let stat10 = await lstat(lock).catch(() => null);
      if (stat10 && Date.now() - stat10.mtimeMs > LOCK_STALE_MS) {
        await rm7(lock, { force: !0 });
        continue;
      }
      await delay(LOCK_RETRY_MS);
    }
  try {
    return await fn();
  } finally {
    await rm7(lock, { force: !0 });
  }
}
async function writeRegistryAtomic(reg) {
  await ensurePrivateBindingsDir();
  let target = bindingsPath(), tmp = tempPath(), serialized = JSON.stringify(reg, null, 2) + `
`, handle;
  try {
    handle = await open2(tmp, "wx", 384), await handle.writeFile(serialized, "utf8"), await handle.sync(), await handle.close(), handle = void 0, await rename3(tmp, target);
  } catch (err) {
    throw await handle?.close().catch(() => {
    }), await rm7(tmp, { force: !0 }).catch(() => {
    }), err;
  }
}
async function mutateRegistry(mutate) {
  await withRegistryLock(async () => {
    let reg = await readRegistryDocumentForMutation();
    await mutate(reg), await writeRegistryAtomic(reg);
  });
}
async function readRegistry() {
  let raw;
  try {
    raw = await readFile7(bindingsPath(), "utf8");
  } catch (err) {
    return isErrnoCode(err, "ENOENT") || console.warn(
      `[byterover] Could not read ${bindingsPath()}: ${describeErr(err)}`
    ), emptyRegistry();
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return console.warn(
      `[byterover] Could not parse ${bindingsPath()}: ${err.message}`
    ), emptyRegistry();
  }
  return typeof parsed != "object" || parsed === null || Array.isArray(parsed) ? (console.warn(
    `[byterover] Expected object root in ${bindingsPath()}, got ${parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed}`
  ), emptyRegistry()) : normalizeRegistryDocument(parsed);
}
async function readBindings() {
  return (await readRegistry()).bindings;
}
async function addBinding(folder, space_id) {
  if (!isUuid(space_id))
    throw new Error("addBinding: space_id must be a UUID string");
  let canonicalFolder = resolve4(folder);
  await mutateRegistry((reg) => {
    let now = (/* @__PURE__ */ new Date()).toISOString(), activeIdx = reg.bindings.findIndex(
      (b) => b.folder === canonicalFolder && b.removedAt === void 0
    );
    if (activeIdx >= 0) {
      let existing = reg.bindings[activeIdx];
      if (existing && existing.space_id === space_id) return;
      existing && (existing.space_id = space_id, existing.addedAt = now);
    } else
      reg.bindings.push({
        folder: canonicalFolder,
        space_id,
        addedAt: now
      });
  });
}
async function removeBinding(folder) {
  let canonicalFolder = resolve4(folder);
  await mutateRegistry((reg) => {
    let activeIdx = reg.bindings.findIndex(
      (b) => b.folder === canonicalFolder && b.removedAt === void 0
    );
    if (activeIdx < 0) return;
    let existing = reg.bindings[activeIdx];
    existing && (existing.removedAt = (/* @__PURE__ */ new Date()).toISOString());
  });
}
async function findBindingForCwd(cwd) {
  let canonicalCwd = resolve4(cwd), reg = await readRegistry(), best = null;
  for (let b of reg.bindings)
    b.removedAt === void 0 && isAncestorOrEqual(b.folder, canonicalCwd) && (best === null || b.folder.length > best.folder.length) && (best = b);
  return best;
}
function dropSoftTombstones(reg, match) {
  reg.deletedSpaces = reg.deletedSpaces.filter(
    (d) => d.hard || !match(d.space_id)
  );
}
async function unmarkSpaceDeleted(space_id) {
  await mutateRegistry((reg) => {
    dropSoftTombstones(reg, (id) => id === space_id);
  });
}
async function isSpaceDeleted(space_id) {
  let found = (await readRegistry()).deletedSpaces.find((d) => d.space_id === space_id);
  return found ? { deleted: !0, hard: found.hard } : { deleted: !1, hard: !1 };
}
async function getDefaultSpaceId() {
  return (await readRegistry()).defaultSpaceId ?? null;
}
function isAncestorOrEqual(ancestor, cwd) {
  return cwd === ancestor ? !0 : cwd.startsWith(ancestor.endsWith(sep5) ? ancestor : ancestor + sep5);
}
function isErrnoCode(err, code) {
  return typeof err == "object" && err !== null && "code" in err && err.code === code;
}
function describeErr(err) {
  return err instanceof Error ? err.message : String(err);
}

// ../../packages/core/src/tree/space-metadata.ts
import { randomBytes as randomBytes3 } from "node:crypto";
import { readFile as readFile8, rename as rename4, rm as rm8, writeFile as writeFile4 } from "node:fs/promises";
import { join as join11 } from "node:path";
var SPACE_METADATA_FILENAME = "metadata.json", InvalidSpaceMetadataError = class extends Error {
  constructor(reason) {
    super(`Invalid metadata.json: ${reason}`);
    this.reason = reason;
    this.name = "InvalidSpaceMetadataError";
  }
};
function validateFields(space_id, space_name, team_id, created_at, team_name) {
  if (!isUuid(space_id))
    throw new InvalidSpaceMetadataError(
      "'space_id' must be a UUID string"
    );
  if (typeof space_name != "string" || space_name.length === 0)
    throw new InvalidSpaceMetadataError(
      "'space_name' must be a non-empty string"
    );
  if (team_id !== null && !isUuid(team_id))
    throw new InvalidSpaceMetadataError(
      "'team_id' must be a UUID string or null"
    );
  if (typeof created_at != "string" || created_at.length === 0)
    throw new InvalidSpaceMetadataError(
      "'created_at' must be an ISO 8601 string"
    );
  if (team_name != null && typeof team_name != "string")
    throw new InvalidSpaceMetadataError(
      "'team_name' must be a string, null, or omitted"
    );
  return {
    created_at,
    space_id,
    space_name,
    team_id,
    ...typeof team_name == "string" ? { team_name } : {}
  };
}
function parseSpaceMetadata(content) {
  let raw;
  try {
    raw = JSON.parse(content);
  } catch (err) {
    throw new InvalidSpaceMetadataError(
      `not valid JSON (${err.message})`
    );
  }
  if (typeof raw != "object" || raw === null || Array.isArray(raw))
    throw new InvalidSpaceMetadataError(
      "root must be a JSON object (got " + (raw === null ? "null" : Array.isArray(raw) ? "array" : typeof raw) + ")"
    );
  let obj = raw;
  return validateFields(
    obj.space_id,
    obj.space_name,
    obj.team_id,
    obj.created_at,
    obj.team_name
  );
}
async function readSpaceMetadata(spaceDir) {
  let target = join11(spaceDir, SPACE_METADATA_FILENAME);
  try {
    let content = await readFile8(target, "utf8");
    return parseSpaceMetadata(content);
  } catch (err) {
    if (isErrnoCode2(err, "ENOENT")) return null;
    throw err;
  }
}
async function writeSpaceMetadata(spaceDir, metadata) {
  validateFields(
    metadata.space_id,
    metadata.space_name,
    metadata.team_id,
    metadata.created_at,
    metadata.team_name
  );
  let target = join11(spaceDir, SPACE_METADATA_FILENAME), tmp = `${target}.tmp.${randomBytes3(6).toString("hex")}`, serialized = `${JSON.stringify(metadata, null, 2)}
`;
  try {
    await writeFile4(tmp, serialized, "utf8"), await rename4(tmp, target);
  } catch (err) {
    throw await rm8(tmp, { force: !0 }).catch(() => {
    }), err;
  }
}
function isErrnoCode2(err, code) {
  return typeof err == "object" && err !== null && "code" in err && err.code === code;
}

// ../../packages/core/src/curate/write.ts
import { existsSync as existsSync3 } from "node:fs";
import { readFile as readFile9 } from "node:fs/promises";
var RESERVED_TOPIC_PATHS2 = /* @__PURE__ */ new Set(["index"]);
function isReservedTopicPath(canonical) {
  return RESERVED_TOPIC_PATHS2.has(canonical.toLowerCase());
}
var DERIVED_SIBLING_SUFFIXES = [
  ".abstract.html",
  ".overview.html",
  ".full.html"
];
async function applyMerge(root, options, now) {
  let survivorCanon, loserCanon;
  try {
    survivorCanon = canonicalizeTopicPath(options.survivorPath), loserCanon = canonicalizeTopicPath(options.loserPath);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), ok: !1 };
  }
  if (survivorCanon.length === 0 || loserCanon.length === 0)
    return {
      error: "merge requires non-empty survivor and loser paths",
      ok: !1
    };
  if (survivorCanon === loserCanon)
    return { error: "cannot merge a topic into itself", ok: !1 };
  if (isReservedTopicPath(survivorCanon) || isReservedTopicPath(loserCanon))
    return {
      error: 'cannot merge a reserved path ("index" collides with the catalog)',
      ok: !1
    };
  let survivorRel = `${survivorCanon}.html`, loserRel = `${loserCanon}.html`, survivorHtml = await readFileSafe(resolveWithinTree(root, survivorRel));
  if (survivorHtml === void 0)
    return { error: `survivor topic not found: ${survivorRel}`, ok: !1 };
  let loserHtml = await readFileSafe(resolveWithinTree(root, loserRel));
  if (loserHtml === void 0)
    return { error: `loser topic not found: ${loserRel}`, ok: !1 };
  let survivorTopic = findBvTopic(parseHtml(survivorHtml)), loserTopic = findBvTopic(parseHtml(loserHtml));
  if (!survivorTopic)
    return { error: `survivor is not a valid <bv-topic>: ${survivorRel}`, ok: !1 };
  if (!loserTopic)
    return { error: `loser is not a valid <bv-topic>: ${loserRel}`, ok: !1 };
  let { children: mergedChildren, dropped } = combineTopicElements(
    survivorTopic,
    loserTopic
  );
  options.reason && !mergedChildren.some((c) => c.tagName === "bv-reason") && mergedChildren.unshift(makeReasonElement(options.reason));
  let doc = { children: [{
    attributes: buildMergedAttributes(
      survivorTopic,
      loserTopic,
      survivorCanon,
      options
    ),
    children: mergedChildren,
    tagName: "bv-topic",
    type: "element"
  }], type: "document" }, mergedHtml = serializeHtml(doc), result = await writeTopic(root, {
    agent: options.agent,
    confirmOverwrite: !0,
    now,
    rawHtml: mergedHtml,
    signer: options.signer
  });
  if (!result.ok)
    return { error: result.errors.map((e) => e.message).join("; "), ok: !1 };
  let loserSignal = await getSignal(root, loserRel);
  await deleteTopic(root, loserRel);
  for (let suffix of DERIVED_SIBLING_SUFFIXES)
    await deleteTopic(root, `${loserCanon}${suffix}`);
  let warnings = [];
  try {
    loserSignal !== void 0 && await updateSignal(root, survivorRel, (current) => {
      let merged = mergeScoring(loserSignal, current);
      return {
        ...merged,
        maturity: determineTier(merged.importance, merged.maturity)
      };
    }), await deleteSignal(root, loserRel);
  } catch (err) {
    warnings.push(
      `signal update after merge failed (best-effort): ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return {
    droppedDuplicates: dropped,
    filePath: result.filePath,
    loserPath: loserRel,
    mergedElementCount: mergedChildren.length,
    ok: !0,
    signalMerged: loserSignal !== void 0,
    survivorPath: survivorRel,
    warnings
  };
}
async function applyDelete(root, topicPath) {
  let canon;
  try {
    canon = canonicalizeTopicPath(topicPath);
  } catch {
    return { deleted: [], missing: !0, ok: !1 };
  }
  if (canon.length === 0) return { deleted: [], missing: !0, ok: !1 };
  if (isReservedTopicPath(canon)) return { deleted: [], missing: !1, ok: !1 };
  let rel = `${canon}.html`, existed = existsSync3(resolveWithinTree(root, rel)), deleted = [];
  existed && (await deleteTopic(root, rel), deleted.push(rel));
  for (let suffix of DERIVED_SIBLING_SUFFIXES) {
    let sibRel = `${canon}${suffix}`;
    existsSync3(resolveWithinTree(root, sibRel)) && (await deleteTopic(root, sibRel), deleted.push(sibRel));
  }
  try {
    await deleteSignal(root, rel);
  } catch {
  }
  return { deleted, missing: !existed, ok: existed };
}
function combineTopicElements(survivor, loser) {
  let seen = /* @__PURE__ */ new Set(), out = [], dropped = 0;
  for (let el of [...bvChildren(survivor), ...bvChildren(loser)]) {
    let key = dedupKey(el);
    if (seen.has(key)) {
      dropped++;
      continue;
    }
    seen.add(key), out.push(el);
  }
  return { children: out, dropped };
}
function unionCsvAttribute(survivorAttr, loserAttr, extra) {
  let merged = orderedUnique([
    ...splitCsv(survivorAttr),
    ...splitCsv(loserAttr),
    ...toList(extra)
  ]);
  return merged.length > 0 ? merged.join(",") : void 0;
}
function buildMergedAttributes(survivor, loser, survivorCanon, options) {
  let attrs = { ...survivor.attributes };
  attrs.path = survivorCanon, delete attrs.createdat, delete attrs.updatedat, delete attrs.sig, delete attrs.kid;
  let explicitTitle = options.title?.trim();
  if (explicitTitle !== void 0 && explicitTitle.length > 0)
    attrs.title = explicitTitle;
  else {
    let survivorTitle = (survivor.attributes.title ?? "").trim(), loserTitle = (loser.attributes.title ?? "").trim();
    survivorTitle.length === 0 && loserTitle.length > 0 && (attrs.title = loserTitle);
  }
  let summary = options.summary ?? survivor.attributes.summary ?? loser.attributes.summary;
  return summary !== void 0 && summary.length > 0 && (attrs.summary = summary), setOrDelete(
    attrs,
    "related",
    unionCsvAttribute(
      survivor.attributes.related,
      loser.attributes.related,
      options.related
    )
  ), setOrDelete(
    attrs,
    "tags",
    unionCsvAttribute(survivor.attributes.tags, loser.attributes.tags, options.tags)
  ), setOrDelete(
    attrs,
    "keywords",
    unionCsvAttribute(
      survivor.attributes.keywords,
      loser.attributes.keywords,
      options.keywords
    )
  ), attrs;
}
function setOrDelete(attrs, key, value) {
  value === void 0 ? delete attrs[key] : attrs[key] = value;
}
function bvChildren(topic) {
  let out = [];
  for (let child of topic.children)
    child.type === "element" && child.tagName.startsWith("bv-") && out.push(child);
  return out;
}
function dedupKey(el) {
  let text = getInnerText(el).toLowerCase().trim();
  return el.tagName === "bv-fact" ? text.length > 0 ? `bv-fact ${text}` : `bv-fact #${attrSignature(el)}` : `${el.tagName} ${text} #${attrSignature(el)}`;
}
function attrSignature(el) {
  let entries = Object.entries(el.attributes).sort(
    (a, b) => a[0].localeCompare(b[0])
  );
  return JSON.stringify(entries);
}
function makeReasonElement(text) {
  return {
    attributes: {},
    children: [{ text, type: "text" }],
    tagName: "bv-reason",
    type: "element"
  };
}
function findBvTopic(doc) {
  for (let node of doc.children)
    if (node.type === "element" && node.tagName === "bv-topic") return node;
}
function canonicalizeTopicPath(input) {
  let segments = input.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\.html$/i, "").split("/").filter((s) => s.length > 0);
  for (let segment of segments)
    if (segment === "." || segment === "..")
      throw new Error(`path may not contain "${segment}" segment: ${input}`);
  return segments.join("/");
}
function splitCsv(attr) {
  return (attr ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}
function toList(extra) {
  return extra === void 0 ? [] : Array.isArray(extra) ? extra.map((s) => s.trim()).filter((s) => s.length > 0) : splitCsv(extra);
}
function orderedUnique(values) {
  let seen = /* @__PURE__ */ new Set(), out = [];
  for (let v of values)
    seen.has(v) || (seen.add(v), out.push(v));
  return out;
}
async function readFileSafe(absPath) {
  try {
    return await readFile9(absPath, "utf8");
  } catch {
    return;
  }
}

// ../../packages/core/src/dream/candidates.ts
import { stat as stat3 } from "node:fs/promises";
var STALE_DAYS = {
  core: Number.POSITIVE_INFINITY,
  // core topics are never pruned
  draft: 60,
  validated: 120
}, DAY_MS = 864e5;
function tokenize(text) {
  return new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
}
function jaccard(a, b) {
  let shared = [];
  for (let term of a) b.has(term) && shared.push(term);
  let union = (/* @__PURE__ */ new Set([...a, ...b])).size || 1;
  return { score: shared.length / union, shared: shared.slice(0, 10) };
}
async function loadTopics(root) {
  let paths = await listTopics(root), sets = /* @__PURE__ */ new Map(), topics = /* @__PURE__ */ new Map();
  for (let path2 of paths) {
    let topic = await readTopic(root, path2);
    topics.set(path2, topic), sets.set(
      path2,
      tokenize(
        `${topic.attributes.title ?? ""} ${topic.attributes.summary ?? ""} ${topic.bodyText}`
      )
    );
  }
  return { paths, sets, topics };
}
function rankPairs(paths, sets, type2, minScore, limit, skip) {
  let out = [];
  for (let i = 0; i < paths.length; i++)
    for (let j = i + 1; j < paths.length; j++) {
      let a = paths[i], b = paths[j];
      if (skip?.(a, b)) continue;
      let { score, shared } = jaccard(
        sets.get(a) ?? /* @__PURE__ */ new Set(),
        sets.get(b) ?? /* @__PURE__ */ new Set()
      );
      score >= minScore && out.push({ a, b, score, shared, type: type2 });
    }
  return out.sort((x, y) => y.score - x.score), out.slice(0, limit);
}
async function scanDreamCandidates(root, options = {}) {
  let { paths, sets } = await loadTopics(root);
  return rankPairs(
    paths,
    sets,
    "merge",
    options.minScore ?? 0.3,
    options.limit ?? 20
  );
}
async function findLinkCandidates(root, options = {}) {
  let { paths, sets, topics } = await loadTopics(root), bare = (path2) => path2.replace(/\.html$/i, ""), relatedSet = (path2) => new Set(
    (topics.get(path2)?.attributes.related ?? "").split(",").map((s) => bare(s.trim())).filter(Boolean)
  ), alreadyLinked = (a, b) => relatedSet(a).has(bare(b)) || relatedSet(b).has(bare(a));
  return rankPairs(
    paths,
    sets,
    "link",
    options.minScore ?? 0.2,
    options.limit ?? 20,
    alreadyLinked
  );
}
async function findPruneCandidates(root, options = {}) {
  let maxImportance = options.maxImportance ?? 35, limit = options.limit ?? 20, nowMs2 = options.now !== void 0 ? Date.parse(options.now) : Number.NaN, paths = await listTopics(root), signals = await getManySignals(root, paths), out = [];
  for (let path2 of paths) {
    let signal = signals.get(path2), maturity = signal?.maturity ?? "draft";
    if (maturity === "core") continue;
    let importance = signal?.importance ?? 50, lowImportance = importance <= maxImportance, stale = !1;
    if (!Number.isNaN(nowMs2)) {
      let mtimeMs = await fileMtimeMs(root, path2);
      mtimeMs !== void 0 && (stale = (nowMs2 - mtimeMs) / DAY_MS >= STALE_DAYS[maturity]);
    }
    if (!lowImportance && !stale) continue;
    let reason = lowImportance && stale ? "both" : lowImportance ? "low-importance" : "stale-mtime";
    out.push({ importance, maturity, path: path2, reason, type: "prune" });
  }
  return out.sort((a, b) => a.importance - b.importance), out.slice(0, limit);
}
async function fileMtimeMs(root, path2) {
  try {
    return (await stat3(resolveWithinTree(root, path2))).mtimeMs;
  } catch {
    return;
  }
}
function countStaleCandidates(candidates) {
  return candidates.filter(
    (c) => c.reason === "stale-mtime" || c.reason === "both"
  ).length;
}
async function findSynthesizeCandidates(root, options = {}) {
  let minTopics = options.minTopics ?? 5, paths = await listTopics(root), byDomain = /* @__PURE__ */ new Map();
  for (let path2 of paths) {
    let domain = path2.includes("/") ? path2.split("/")[0] : "";
    if (!domain) continue;
    let list = byDomain.get(domain) ?? [];
    list.push(path2), byDomain.set(domain, list);
  }
  let out = [];
  for (let [domain, topics] of byDomain)
    topics.length >= minTopics && out.push({ domain, topics: topics.sort(), type: "synthesize" });
  return out.sort((a, b) => b.topics.length - a.topics.length), out;
}

// ../../packages/core/src/search/search.ts
import { stat as stat4 } from "node:fs/promises";

// ../../node_modules/.pnpm/minisearch@7.2.0/node_modules/minisearch/dist/es/index.js
var ENTRIES = "ENTRIES", KEYS = "KEYS", VALUES = "VALUES";
var TreeIterator = class {
  constructor(set2, type2) {
    let node = set2._tree, keys = Array.from(node.keys());
    this.set = set2, this._type = type2, this._path = keys.length > 0 ? [{ node, keys }] : [];
  }
  next() {
    let value = this.dive();
    return this.backtrack(), value;
  }
  dive() {
    if (this._path.length === 0)
      return { done: !0, value: void 0 };
    let { node, keys } = last$1(this._path);
    if (last$1(keys) === "")
      return { done: !1, value: this.result() };
    let child = node.get(last$1(keys));
    return this._path.push({ node: child, keys: Array.from(child.keys()) }), this.dive();
  }
  backtrack() {
    if (this._path.length === 0)
      return;
    let keys = last$1(this._path).keys;
    keys.pop(), !(keys.length > 0) && (this._path.pop(), this.backtrack());
  }
  key() {
    return this.set._prefix + this._path.map(({ keys }) => last$1(keys)).filter((key) => key !== "").join("");
  }
  value() {
    return last$1(this._path).node.get("");
  }
  result() {
    switch (this._type) {
      case VALUES:
        return this.value();
      case KEYS:
        return this.key();
      default:
        return [this.key(), this.value()];
    }
  }
  [Symbol.iterator]() {
    return this;
  }
}, last$1 = (array) => array[array.length - 1], fuzzySearch = (node, query, maxDistance) => {
  let results = /* @__PURE__ */ new Map();
  if (query === void 0)
    return results;
  let n = query.length + 1, m = n + maxDistance, matrix = new Uint8Array(m * n).fill(maxDistance + 1);
  for (let j = 0; j < n; ++j)
    matrix[j] = j;
  for (let i = 1; i < m; ++i)
    matrix[i * n] = i;
  return recurse(node, query, maxDistance, results, matrix, 1, n, ""), results;
}, recurse = (node, query, maxDistance, results, matrix, m, n, prefix) => {
  let offset = m * n;
  key: for (let key of node.keys())
    if (key === "") {
      let distance = matrix[offset - 1];
      distance <= maxDistance && results.set(prefix, [node.get(key), distance]);
    } else {
      let i = m;
      for (let pos = 0; pos < key.length; ++pos, ++i) {
        let char = key[pos], thisRowOffset = n * i, prevRowOffset = thisRowOffset - n, minDistance = matrix[thisRowOffset], jmin = Math.max(0, i - maxDistance - 1), jmax = Math.min(n - 1, i + maxDistance);
        for (let j = jmin; j < jmax; ++j) {
          let different = char !== query[j], rpl = matrix[prevRowOffset + j] + +different, del = matrix[prevRowOffset + j + 1] + 1, ins = matrix[thisRowOffset + j] + 1, dist = matrix[thisRowOffset + j + 1] = Math.min(rpl, del, ins);
          dist < minDistance && (minDistance = dist);
        }
        if (minDistance > maxDistance)
          continue key;
      }
      recurse(node.get(key), query, maxDistance, results, matrix, i, n, prefix + key);
    }
}, SearchableMap = class _SearchableMap {
  /**
   * The constructor is normally called without arguments, creating an empty
   * map. In order to create a {@link SearchableMap} from an iterable or from an
   * object, check {@link SearchableMap.from} and {@link
   * SearchableMap.fromObject}.
   *
   * The constructor arguments are for internal use, when creating derived
   * mutable views of a map at a prefix.
   */
  constructor(tree = /* @__PURE__ */ new Map(), prefix = "") {
    this._size = void 0, this._tree = tree, this._prefix = prefix;
  }
  /**
   * Creates and returns a mutable view of this {@link SearchableMap},
   * containing only entries that share the given prefix.
   *
   * ### Usage:
   *
   * ```javascript
   * let map = new SearchableMap()
   * map.set("unicorn", 1)
   * map.set("universe", 2)
   * map.set("university", 3)
   * map.set("unique", 4)
   * map.set("hello", 5)
   *
   * let uni = map.atPrefix("uni")
   * uni.get("unique") // => 4
   * uni.get("unicorn") // => 1
   * uni.get("hello") // => undefined
   *
   * let univer = map.atPrefix("univer")
   * univer.get("unique") // => undefined
   * univer.get("universe") // => 2
   * univer.get("university") // => 3
   * ```
   *
   * @param prefix  The prefix
   * @return A {@link SearchableMap} representing a mutable view of the original
   * Map at the given prefix
   */
  atPrefix(prefix) {
    if (!prefix.startsWith(this._prefix))
      throw new Error("Mismatched prefix");
    let [node, path2] = trackDown(this._tree, prefix.slice(this._prefix.length));
    if (node === void 0) {
      let [parentNode, key] = last(path2);
      for (let k of parentNode.keys())
        if (k !== "" && k.startsWith(key)) {
          let node2 = /* @__PURE__ */ new Map();
          return node2.set(k.slice(key.length), parentNode.get(k)), new _SearchableMap(node2, prefix);
        }
    }
    return new _SearchableMap(node, prefix);
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/clear
   */
  clear() {
    this._size = void 0, this._tree.clear();
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/delete
   * @param key  Key to delete
   */
  delete(key) {
    return this._size = void 0, remove(this._tree, key);
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries
   * @return An iterator iterating through `[key, value]` entries.
   */
  entries() {
    return new TreeIterator(this, ENTRIES);
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/forEach
   * @param fn  Iteration function
   */
  forEach(fn) {
    for (let [key, value] of this)
      fn(key, value, this);
  }
  /**
   * Returns a Map of all the entries that have a key within the given edit
   * distance from the search key. The keys of the returned Map are the matching
   * keys, while the values are two-element arrays where the first element is
   * the value associated to the key, and the second is the edit distance of the
   * key to the search key.
   *
   * ### Usage:
   *
   * ```javascript
   * let map = new SearchableMap()
   * map.set('hello', 'world')
   * map.set('hell', 'yeah')
   * map.set('ciao', 'mondo')
   *
   * // Get all entries that match the key 'hallo' with a maximum edit distance of 2
   * map.fuzzyGet('hallo', 2)
   * // => Map(2) { 'hello' => ['world', 1], 'hell' => ['yeah', 2] }
   *
   * // In the example, the "hello" key has value "world" and edit distance of 1
   * // (change "e" to "a"), the key "hell" has value "yeah" and edit distance of 2
   * // (change "e" to "a", delete "o")
   * ```
   *
   * @param key  The search key
   * @param maxEditDistance  The maximum edit distance (Levenshtein)
   * @return A Map of the matching keys to their value and edit distance
   */
  fuzzyGet(key, maxEditDistance) {
    return fuzzySearch(this._tree, key, maxEditDistance);
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/get
   * @param key  Key to get
   * @return Value associated to the key, or `undefined` if the key is not
   * found.
   */
  get(key) {
    let node = lookup(this._tree, key);
    return node !== void 0 ? node.get("") : void 0;
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/has
   * @param key  Key
   * @return True if the key is in the map, false otherwise
   */
  has(key) {
    let node = lookup(this._tree, key);
    return node !== void 0 && node.has("");
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/keys
   * @return An `Iterable` iterating through keys
   */
  keys() {
    return new TreeIterator(this, KEYS);
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/set
   * @param key  Key to set
   * @param value  Value to associate to the key
   * @return The {@link SearchableMap} itself, to allow chaining
   */
  set(key, value) {
    if (typeof key != "string")
      throw new Error("key must be a string");
    return this._size = void 0, createPath(this._tree, key).set("", value), this;
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/size
   */
  get size() {
    if (this._size)
      return this._size;
    this._size = 0;
    let iter = this.entries();
    for (; !iter.next().done; )
      this._size += 1;
    return this._size;
  }
  /**
   * Updates the value at the given key using the provided function. The function
   * is called with the current value at the key, and its return value is used as
   * the new value to be set.
   *
   * ### Example:
   *
   * ```javascript
   * // Increment the current value by one
   * searchableMap.update('somekey', (currentValue) => currentValue == null ? 0 : currentValue + 1)
   * ```
   *
   * If the value at the given key is or will be an object, it might not require
   * re-assignment. In that case it is better to use `fetch()`, because it is
   * faster.
   *
   * @param key  The key to update
   * @param fn  The function used to compute the new value from the current one
   * @return The {@link SearchableMap} itself, to allow chaining
   */
  update(key, fn) {
    if (typeof key != "string")
      throw new Error("key must be a string");
    this._size = void 0;
    let node = createPath(this._tree, key);
    return node.set("", fn(node.get(""))), this;
  }
  /**
   * Fetches the value of the given key. If the value does not exist, calls the
   * given function to create a new value, which is inserted at the given key
   * and subsequently returned.
   *
   * ### Example:
   *
   * ```javascript
   * const map = searchableMap.fetch('somekey', () => new Map())
   * map.set('foo', 'bar')
   * ```
   *
   * @param key  The key to update
   * @param initial  A function that creates a new value if the key does not exist
   * @return The existing or new value at the given key
   */
  fetch(key, initial) {
    if (typeof key != "string")
      throw new Error("key must be a string");
    this._size = void 0;
    let node = createPath(this._tree, key), value = node.get("");
    return value === void 0 && node.set("", value = initial()), value;
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/values
   * @return An `Iterable` iterating through values.
   */
  values() {
    return new TreeIterator(this, VALUES);
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/@@iterator
   */
  [Symbol.iterator]() {
    return this.entries();
  }
  /**
   * Creates a {@link SearchableMap} from an `Iterable` of entries
   *
   * @param entries  Entries to be inserted in the {@link SearchableMap}
   * @return A new {@link SearchableMap} with the given entries
   */
  static from(entries) {
    let tree = new _SearchableMap();
    for (let [key, value] of entries)
      tree.set(key, value);
    return tree;
  }
  /**
   * Creates a {@link SearchableMap} from the iterable properties of a JavaScript object
   *
   * @param object  Object of entries for the {@link SearchableMap}
   * @return A new {@link SearchableMap} with the given entries
   */
  static fromObject(object) {
    return _SearchableMap.from(Object.entries(object));
  }
}, trackDown = (tree, key, path2 = []) => {
  if (key.length === 0 || tree == null)
    return [tree, path2];
  for (let k of tree.keys())
    if (k !== "" && key.startsWith(k))
      return path2.push([tree, k]), trackDown(tree.get(k), key.slice(k.length), path2);
  return path2.push([tree, key]), trackDown(void 0, "", path2);
}, lookup = (tree, key) => {
  if (key.length === 0 || tree == null)
    return tree;
  for (let k of tree.keys())
    if (k !== "" && key.startsWith(k))
      return lookup(tree.get(k), key.slice(k.length));
}, createPath = (node, key) => {
  let keyLength = key.length;
  outer: for (let pos = 0; node && pos < keyLength; ) {
    for (let k of node.keys())
      if (k !== "" && key[pos] === k[0]) {
        let len = Math.min(keyLength - pos, k.length), offset = 1;
        for (; offset < len && key[pos + offset] === k[offset]; )
          ++offset;
        let child2 = node.get(k);
        if (offset === k.length)
          node = child2;
        else {
          let intermediate = /* @__PURE__ */ new Map();
          intermediate.set(k.slice(offset), child2), node.set(key.slice(pos, pos + offset), intermediate), node.delete(k), node = intermediate;
        }
        pos += offset;
        continue outer;
      }
    let child = /* @__PURE__ */ new Map();
    return node.set(key.slice(pos), child), child;
  }
  return node;
}, remove = (tree, key) => {
  let [node, path2] = trackDown(tree, key);
  if (node !== void 0) {
    if (node.delete(""), node.size === 0)
      cleanup(path2);
    else if (node.size === 1) {
      let [key2, value] = node.entries().next().value;
      merge2(path2, key2, value);
    }
  }
}, cleanup = (path2) => {
  if (path2.length === 0)
    return;
  let [node, key] = last(path2);
  if (node.delete(key), node.size === 0)
    cleanup(path2.slice(0, -1));
  else if (node.size === 1) {
    let [key2, value] = node.entries().next().value;
    key2 !== "" && merge2(path2.slice(0, -1), key2, value);
  }
}, merge2 = (path2, key, value) => {
  if (path2.length === 0)
    return;
  let [node, nodeKey] = last(path2);
  node.set(nodeKey + key, value), node.delete(nodeKey);
}, last = (array) => array[array.length - 1], OR = "or", AND = "and", AND_NOT = "and_not", MiniSearch = class _MiniSearch {
  /**
   * @param options  Configuration options
   *
   * ### Examples:
   *
   * ```javascript
   * // Create a search engine that indexes the 'title' and 'text' fields of your
   * // documents:
   * const miniSearch = new MiniSearch({ fields: ['title', 'text'] })
   * ```
   *
   * ### ID Field:
   *
   * ```javascript
   * // Your documents are assumed to include a unique 'id' field, but if you want
   * // to use a different field for document identification, you can set the
   * // 'idField' option:
   * const miniSearch = new MiniSearch({ idField: 'key', fields: ['title', 'text'] })
   * ```
   *
   * ### Options and defaults:
   *
   * ```javascript
   * // The full set of options (here with their default value) is:
   * const miniSearch = new MiniSearch({
   *   // idField: field that uniquely identifies a document
   *   idField: 'id',
   *
   *   // extractField: function used to get the value of a field in a document.
   *   // By default, it assumes the document is a flat object with field names as
   *   // property keys and field values as string property values, but custom logic
   *   // can be implemented by setting this option to a custom extractor function.
   *   extractField: (document, fieldName) => document[fieldName],
   *
   *   // tokenize: function used to split fields into individual terms. By
   *   // default, it is also used to tokenize search queries, unless a specific
   *   // `tokenize` search option is supplied. When tokenizing an indexed field,
   *   // the field name is passed as the second argument.
   *   tokenize: (string, _fieldName) => string.split(SPACE_OR_PUNCTUATION),
   *
   *   // processTerm: function used to process each tokenized term before
   *   // indexing. It can be used for stemming and normalization. Return a falsy
   *   // value in order to discard a term. By default, it is also used to process
   *   // search queries, unless a specific `processTerm` option is supplied as a
   *   // search option. When processing a term from a indexed field, the field
   *   // name is passed as the second argument.
   *   processTerm: (term, _fieldName) => term.toLowerCase(),
   *
   *   // searchOptions: default search options, see the `search` method for
   *   // details
   *   searchOptions: undefined,
   *
   *   // fields: document fields to be indexed. Mandatory, but not set by default
   *   fields: undefined
   *
   *   // storeFields: document fields to be stored and returned as part of the
   *   // search results.
   *   storeFields: []
   * })
   * ```
   */
  constructor(options) {
    if (options?.fields == null)
      throw new Error('MiniSearch: option "fields" must be provided');
    let autoVacuum = options.autoVacuum == null || options.autoVacuum === !0 ? defaultAutoVacuumOptions : options.autoVacuum;
    this._options = {
      ...defaultOptions,
      ...options,
      autoVacuum,
      searchOptions: { ...defaultSearchOptions, ...options.searchOptions || {} },
      autoSuggestOptions: { ...defaultAutoSuggestOptions, ...options.autoSuggestOptions || {} }
    }, this._index = new SearchableMap(), this._documentCount = 0, this._documentIds = /* @__PURE__ */ new Map(), this._idToShortId = /* @__PURE__ */ new Map(), this._fieldIds = {}, this._fieldLength = /* @__PURE__ */ new Map(), this._avgFieldLength = [], this._nextId = 0, this._storedFields = /* @__PURE__ */ new Map(), this._dirtCount = 0, this._currentVacuum = null, this._enqueuedVacuum = null, this._enqueuedVacuumConditions = defaultVacuumConditions, this.addFields(this._options.fields);
  }
  /**
   * Adds a document to the index
   *
   * @param document  The document to be indexed
   */
  add(document) {
    let { extractField, stringifyField, tokenize: tokenize2, processTerm, fields, idField } = this._options, id = extractField(document, idField);
    if (id == null)
      throw new Error(`MiniSearch: document does not have ID field "${idField}"`);
    if (this._idToShortId.has(id))
      throw new Error(`MiniSearch: duplicate ID ${id}`);
    let shortDocumentId = this.addDocumentId(id);
    this.saveStoredFields(shortDocumentId, document);
    for (let field of fields) {
      let fieldValue = extractField(document, field);
      if (fieldValue == null)
        continue;
      let tokens = tokenize2(stringifyField(fieldValue, field), field), fieldId = this._fieldIds[field], uniqueTerms = new Set(tokens).size;
      this.addFieldLength(shortDocumentId, fieldId, this._documentCount - 1, uniqueTerms);
      for (let term of tokens) {
        let processedTerm = processTerm(term, field);
        if (Array.isArray(processedTerm))
          for (let t of processedTerm)
            this.addTerm(fieldId, shortDocumentId, t);
        else processedTerm && this.addTerm(fieldId, shortDocumentId, processedTerm);
      }
    }
  }
  /**
   * Adds all the given documents to the index
   *
   * @param documents  An array of documents to be indexed
   */
  addAll(documents) {
    for (let document of documents)
      this.add(document);
  }
  /**
   * Adds all the given documents to the index asynchronously.
   *
   * Returns a promise that resolves (to `undefined`) when the indexing is done.
   * This method is useful when index many documents, to avoid blocking the main
   * thread. The indexing is performed asynchronously and in chunks.
   *
   * @param documents  An array of documents to be indexed
   * @param options  Configuration options
   * @return A promise resolving to `undefined` when the indexing is done
   */
  addAllAsync(documents, options = {}) {
    let { chunkSize = 10 } = options, acc = { chunk: [], promise: Promise.resolve() }, { chunk: chunk2, promise } = documents.reduce(({ chunk: chunk3, promise: promise2 }, document, i) => (chunk3.push(document), (i + 1) % chunkSize === 0 ? {
      chunk: [],
      promise: promise2.then(() => new Promise((resolve11) => setTimeout(resolve11, 0))).then(() => this.addAll(chunk3))
    } : { chunk: chunk3, promise: promise2 }), acc);
    return promise.then(() => this.addAll(chunk2));
  }
  /**
   * Removes the given document from the index.
   *
   * The document to remove must NOT have changed between indexing and removal,
   * otherwise the index will be corrupted.
   *
   * This method requires passing the full document to be removed (not just the
   * ID), and immediately removes the document from the inverted index, allowing
   * memory to be released. A convenient alternative is {@link
   * MiniSearch#discard}, which needs only the document ID, and has the same
   * visible effect, but delays cleaning up the index until the next vacuuming.
   *
   * @param document  The document to be removed
   */
  remove(document) {
    let { tokenize: tokenize2, processTerm, extractField, stringifyField, fields, idField } = this._options, id = extractField(document, idField);
    if (id == null)
      throw new Error(`MiniSearch: document does not have ID field "${idField}"`);
    let shortId = this._idToShortId.get(id);
    if (shortId == null)
      throw new Error(`MiniSearch: cannot remove document with ID ${id}: it is not in the index`);
    for (let field of fields) {
      let fieldValue = extractField(document, field);
      if (fieldValue == null)
        continue;
      let tokens = tokenize2(stringifyField(fieldValue, field), field), fieldId = this._fieldIds[field], uniqueTerms = new Set(tokens).size;
      this.removeFieldLength(shortId, fieldId, this._documentCount, uniqueTerms);
      for (let term of tokens) {
        let processedTerm = processTerm(term, field);
        if (Array.isArray(processedTerm))
          for (let t of processedTerm)
            this.removeTerm(fieldId, shortId, t);
        else processedTerm && this.removeTerm(fieldId, shortId, processedTerm);
      }
    }
    this._storedFields.delete(shortId), this._documentIds.delete(shortId), this._idToShortId.delete(id), this._fieldLength.delete(shortId), this._documentCount -= 1;
  }
  /**
   * Removes all the given documents from the index. If called with no arguments,
   * it removes _all_ documents from the index.
   *
   * @param documents  The documents to be removed. If this argument is omitted,
   * all documents are removed. Note that, for removing all documents, it is
   * more efficient to call this method with no arguments than to pass all
   * documents.
   */
  removeAll(documents) {
    if (documents)
      for (let document of documents)
        this.remove(document);
    else {
      if (arguments.length > 0)
        throw new Error("Expected documents to be present. Omit the argument to remove all documents.");
      this._index = new SearchableMap(), this._documentCount = 0, this._documentIds = /* @__PURE__ */ new Map(), this._idToShortId = /* @__PURE__ */ new Map(), this._fieldLength = /* @__PURE__ */ new Map(), this._avgFieldLength = [], this._storedFields = /* @__PURE__ */ new Map(), this._nextId = 0;
    }
  }
  /**
   * Discards the document with the given ID, so it won't appear in search results
   *
   * It has the same visible effect of {@link MiniSearch.remove} (both cause the
   * document to stop appearing in searches), but a different effect on the
   * internal data structures:
   *
   *   - {@link MiniSearch#remove} requires passing the full document to be
   *   removed as argument, and removes it from the inverted index immediately.
   *
   *   - {@link MiniSearch#discard} instead only needs the document ID, and
   *   works by marking the current version of the document as discarded, so it
   *   is immediately ignored by searches. This is faster and more convenient
   *   than {@link MiniSearch#remove}, but the index is not immediately
   *   modified. To take care of that, vacuuming is performed after a certain
   *   number of documents are discarded, cleaning up the index and allowing
   *   memory to be released.
   *
   * After discarding a document, it is possible to re-add a new version, and
   * only the new version will appear in searches. In other words, discarding
   * and re-adding a document works exactly like removing and re-adding it. The
   * {@link MiniSearch.replace} method can also be used to replace a document
   * with a new version.
   *
   * #### Details about vacuuming
   *
   * Repetite calls to this method would leave obsolete document references in
   * the index, invisible to searches. Two mechanisms take care of cleaning up:
   * clean up during search, and vacuuming.
   *
   *   - Upon search, whenever a discarded ID is found (and ignored for the
   *   results), references to the discarded document are removed from the
   *   inverted index entries for the search terms. This ensures that subsequent
   *   searches for the same terms do not need to skip these obsolete references
   *   again.
   *
   *   - In addition, vacuuming is performed automatically by default (see the
   *   `autoVacuum` field in {@link Options}) after a certain number of
   *   documents are discarded. Vacuuming traverses all terms in the index,
   *   cleaning up all references to discarded documents. Vacuuming can also be
   *   triggered manually by calling {@link MiniSearch#vacuum}.
   *
   * @param id  The ID of the document to be discarded
   */
  discard(id) {
    let shortId = this._idToShortId.get(id);
    if (shortId == null)
      throw new Error(`MiniSearch: cannot discard document with ID ${id}: it is not in the index`);
    this._idToShortId.delete(id), this._documentIds.delete(shortId), this._storedFields.delete(shortId), (this._fieldLength.get(shortId) || []).forEach((fieldLength, fieldId) => {
      this.removeFieldLength(shortId, fieldId, this._documentCount, fieldLength);
    }), this._fieldLength.delete(shortId), this._documentCount -= 1, this._dirtCount += 1, this.maybeAutoVacuum();
  }
  maybeAutoVacuum() {
    if (this._options.autoVacuum === !1)
      return;
    let { minDirtFactor, minDirtCount, batchSize, batchWait } = this._options.autoVacuum;
    this.conditionalVacuum({ batchSize, batchWait }, { minDirtCount, minDirtFactor });
  }
  /**
   * Discards the documents with the given IDs, so they won't appear in search
   * results
   *
   * It is equivalent to calling {@link MiniSearch#discard} for all the given
   * IDs, but with the optimization of triggering at most one automatic
   * vacuuming at the end.
   *
   * Note: to remove all documents from the index, it is faster and more
   * convenient to call {@link MiniSearch.removeAll} with no argument, instead
   * of passing all IDs to this method.
   */
  discardAll(ids) {
    let autoVacuum = this._options.autoVacuum;
    try {
      this._options.autoVacuum = !1;
      for (let id of ids)
        this.discard(id);
    } finally {
      this._options.autoVacuum = autoVacuum;
    }
    this.maybeAutoVacuum();
  }
  /**
   * It replaces an existing document with the given updated version
   *
   * It works by discarding the current version and adding the updated one, so
   * it is functionally equivalent to calling {@link MiniSearch#discard}
   * followed by {@link MiniSearch#add}. The ID of the updated document should
   * be the same as the original one.
   *
   * Since it uses {@link MiniSearch#discard} internally, this method relies on
   * vacuuming to clean up obsolete document references from the index, allowing
   * memory to be released (see {@link MiniSearch#discard}).
   *
   * @param updatedDocument  The updated document to replace the old version
   * with
   */
  replace(updatedDocument) {
    let { idField, extractField } = this._options, id = extractField(updatedDocument, idField);
    this.discard(id), this.add(updatedDocument);
  }
  /**
   * Triggers a manual vacuuming, cleaning up references to discarded documents
   * from the inverted index
   *
   * Vacuuming is only useful for applications that use the {@link
   * MiniSearch#discard} or {@link MiniSearch#replace} methods.
   *
   * By default, vacuuming is performed automatically when needed (controlled by
   * the `autoVacuum` field in {@link Options}), so there is usually no need to
   * call this method, unless one wants to make sure to perform vacuuming at a
   * specific moment.
   *
   * Vacuuming traverses all terms in the inverted index in batches, and cleans
   * up references to discarded documents from the posting list, allowing memory
   * to be released.
   *
   * The method takes an optional object as argument with the following keys:
   *
   *   - `batchSize`: the size of each batch (1000 by default)
   *
   *   - `batchWait`: the number of milliseconds to wait between batches (10 by
   *   default)
   *
   * On large indexes, vacuuming could have a non-negligible cost: batching
   * avoids blocking the thread for long, diluting this cost so that it is not
   * negatively affecting the application. Nonetheless, this method should only
   * be called when necessary, and relying on automatic vacuuming is usually
   * better.
   *
   * It returns a promise that resolves (to undefined) when the clean up is
   * completed. If vacuuming is already ongoing at the time this method is
   * called, a new one is enqueued immediately after the ongoing one, and a
   * corresponding promise is returned. However, no more than one vacuuming is
   * enqueued on top of the ongoing one, even if this method is called more
   * times (enqueuing multiple ones would be useless).
   *
   * @param options  Configuration options for the batch size and delay. See
   * {@link VacuumOptions}.
   */
  vacuum(options = {}) {
    return this.conditionalVacuum(options);
  }
  conditionalVacuum(options, conditions) {
    return this._currentVacuum ? (this._enqueuedVacuumConditions = this._enqueuedVacuumConditions && conditions, this._enqueuedVacuum != null ? this._enqueuedVacuum : (this._enqueuedVacuum = this._currentVacuum.then(() => {
      let conditions2 = this._enqueuedVacuumConditions;
      return this._enqueuedVacuumConditions = defaultVacuumConditions, this.performVacuuming(options, conditions2);
    }), this._enqueuedVacuum)) : this.vacuumConditionsMet(conditions) === !1 ? Promise.resolve() : (this._currentVacuum = this.performVacuuming(options), this._currentVacuum);
  }
  async performVacuuming(options, conditions) {
    let initialDirtCount = this._dirtCount;
    if (this.vacuumConditionsMet(conditions)) {
      let batchSize = options.batchSize || defaultVacuumOptions.batchSize, batchWait = options.batchWait || defaultVacuumOptions.batchWait, i = 1;
      for (let [term, fieldsData] of this._index) {
        for (let [fieldId, fieldIndex] of fieldsData)
          for (let [shortId] of fieldIndex)
            this._documentIds.has(shortId) || (fieldIndex.size <= 1 ? fieldsData.delete(fieldId) : fieldIndex.delete(shortId));
        this._index.get(term).size === 0 && this._index.delete(term), i % batchSize === 0 && await new Promise((resolve11) => setTimeout(resolve11, batchWait)), i += 1;
      }
      this._dirtCount -= initialDirtCount;
    }
    await null, this._currentVacuum = this._enqueuedVacuum, this._enqueuedVacuum = null;
  }
  vacuumConditionsMet(conditions) {
    if (conditions == null)
      return !0;
    let { minDirtCount, minDirtFactor } = conditions;
    return minDirtCount = minDirtCount || defaultAutoVacuumOptions.minDirtCount, minDirtFactor = minDirtFactor || defaultAutoVacuumOptions.minDirtFactor, this.dirtCount >= minDirtCount && this.dirtFactor >= minDirtFactor;
  }
  /**
   * Is `true` if a vacuuming operation is ongoing, `false` otherwise
   */
  get isVacuuming() {
    return this._currentVacuum != null;
  }
  /**
   * The number of documents discarded since the most recent vacuuming
   */
  get dirtCount() {
    return this._dirtCount;
  }
  /**
   * A number between 0 and 1 giving an indication about the proportion of
   * documents that are discarded, and can therefore be cleaned up by vacuuming.
   * A value close to 0 means that the index is relatively clean, while a higher
   * value means that the index is relatively dirty, and vacuuming could release
   * memory.
   */
  get dirtFactor() {
    return this._dirtCount / (1 + this._documentCount + this._dirtCount);
  }
  /**
   * Returns `true` if a document with the given ID is present in the index and
   * available for search, `false` otherwise
   *
   * @param id  The document ID
   */
  has(id) {
    return this._idToShortId.has(id);
  }
  /**
   * Returns the stored fields (as configured in the `storeFields` constructor
   * option) for the given document ID. Returns `undefined` if the document is
   * not present in the index.
   *
   * @param id  The document ID
   */
  getStoredFields(id) {
    let shortId = this._idToShortId.get(id);
    if (shortId != null)
      return this._storedFields.get(shortId);
  }
  /**
   * Search for documents matching the given search query.
   *
   * The result is a list of scored document IDs matching the query, sorted by
   * descending score, and each including data about which terms were matched and
   * in which fields.
   *
   * ### Basic usage:
   *
   * ```javascript
   * // Search for "zen art motorcycle" with default options: terms have to match
   * // exactly, and individual terms are joined with OR
   * miniSearch.search('zen art motorcycle')
   * // => [ { id: 2, score: 2.77258, match: { ... } }, { id: 4, score: 1.38629, match: { ... } } ]
   * ```
   *
   * ### Restrict search to specific fields:
   *
   * ```javascript
   * // Search only in the 'title' field
   * miniSearch.search('zen', { fields: ['title'] })
   * ```
   *
   * ### Field boosting:
   *
   * ```javascript
   * // Boost a field
   * miniSearch.search('zen', { boost: { title: 2 } })
   * ```
   *
   * ### Prefix search:
   *
   * ```javascript
   * // Search for "moto" with prefix search (it will match documents
   * // containing terms that start with "moto" or "neuro")
   * miniSearch.search('moto neuro', { prefix: true })
   * ```
   *
   * ### Fuzzy search:
   *
   * ```javascript
   * // Search for "ismael" with fuzzy search (it will match documents containing
   * // terms similar to "ismael", with a maximum edit distance of 0.2 term.length
   * // (rounded to nearest integer)
   * miniSearch.search('ismael', { fuzzy: 0.2 })
   * ```
   *
   * ### Combining strategies:
   *
   * ```javascript
   * // Mix of exact match, prefix search, and fuzzy search
   * miniSearch.search('ismael mob', {
   *  prefix: true,
   *  fuzzy: 0.2
   * })
   * ```
   *
   * ### Advanced prefix and fuzzy search:
   *
   * ```javascript
   * // Perform fuzzy and prefix search depending on the search term. Here
   * // performing prefix and fuzzy search only on terms longer than 3 characters
   * miniSearch.search('ismael mob', {
   *  prefix: term => term.length > 3
   *  fuzzy: term => term.length > 3 ? 0.2 : null
   * })
   * ```
   *
   * ### Combine with AND:
   *
   * ```javascript
   * // Combine search terms with AND (to match only documents that contain both
   * // "motorcycle" and "art")
   * miniSearch.search('motorcycle art', { combineWith: 'AND' })
   * ```
   *
   * ### Combine with AND_NOT:
   *
   * There is also an AND_NOT combinator, that finds documents that match the
   * first term, but do not match any of the other terms. This combinator is
   * rarely useful with simple queries, and is meant to be used with advanced
   * query combinations (see later for more details).
   *
   * ### Filtering results:
   *
   * ```javascript
   * // Filter only results in the 'fiction' category (assuming that 'category'
   * // is a stored field)
   * miniSearch.search('motorcycle art', {
   *   filter: (result) => result.category === 'fiction'
   * })
   * ```
   *
   * ### Wildcard query
   *
   * Searching for an empty string (assuming the default tokenizer) returns no
   * results. Sometimes though, one needs to match all documents, like in a
   * "wildcard" search. This is possible by passing the special value
   * {@link MiniSearch.wildcard} as the query:
   *
   * ```javascript
   * // Return search results for all documents
   * miniSearch.search(MiniSearch.wildcard)
   * ```
   *
   * Note that search options such as `filter` and `boostDocument` are still
   * applied, influencing which results are returned, and their order:
   *
   * ```javascript
   * // Return search results for all documents in the 'fiction' category
   * miniSearch.search(MiniSearch.wildcard, {
   *   filter: (result) => result.category === 'fiction'
   * })
   * ```
   *
   * ### Advanced combination of queries:
   *
   * It is possible to combine different subqueries with OR, AND, and AND_NOT,
   * and even with different search options, by passing a query expression
   * tree object as the first argument, instead of a string.
   *
   * ```javascript
   * // Search for documents that contain "zen" and ("motorcycle" or "archery")
   * miniSearch.search({
   *   combineWith: 'AND',
   *   queries: [
   *     'zen',
   *     {
   *       combineWith: 'OR',
   *       queries: ['motorcycle', 'archery']
   *     }
   *   ]
   * })
   *
   * // Search for documents that contain ("apple" or "pear") but not "juice" and
   * // not "tree"
   * miniSearch.search({
   *   combineWith: 'AND_NOT',
   *   queries: [
   *     {
   *       combineWith: 'OR',
   *       queries: ['apple', 'pear']
   *     },
   *     'juice',
   *     'tree'
   *   ]
   * })
   * ```
   *
   * Each node in the expression tree can be either a string, or an object that
   * supports all {@link SearchOptions} fields, plus a `queries` array field for
   * subqueries.
   *
   * Note that, while this can become complicated to do by hand for complex or
   * deeply nested queries, it provides a formalized expression tree API for
   * external libraries that implement a parser for custom query languages.
   *
   * @param query  Search query
   * @param searchOptions  Search options. Each option, if not given, defaults to the corresponding value of `searchOptions` given to the constructor, or to the library default.
   */
  search(query, searchOptions = {}) {
    let { searchOptions: globalSearchOptions } = this._options, searchOptionsWithDefaults = { ...globalSearchOptions, ...searchOptions }, rawResults = this.executeQuery(query, searchOptions), results = [];
    for (let [docId, { score, terms, match }] of rawResults) {
      let quality = terms.length || 1, result = {
        id: this._documentIds.get(docId),
        score: score * quality,
        terms: Object.keys(match),
        queryTerms: terms,
        match
      };
      Object.assign(result, this._storedFields.get(docId)), (searchOptionsWithDefaults.filter == null || searchOptionsWithDefaults.filter(result)) && results.push(result);
    }
    return query === _MiniSearch.wildcard && searchOptionsWithDefaults.boostDocument == null || results.sort(byScore), results;
  }
  /**
   * Provide suggestions for the given search query
   *
   * The result is a list of suggested modified search queries, derived from the
   * given search query, each with a relevance score, sorted by descending score.
   *
   * By default, it uses the same options used for search, except that by
   * default it performs prefix search on the last term of the query, and
   * combine terms with `'AND'` (requiring all query terms to match). Custom
   * options can be passed as a second argument. Defaults can be changed upon
   * calling the {@link MiniSearch} constructor, by passing a
   * `autoSuggestOptions` option.
   *
   * ### Basic usage:
   *
   * ```javascript
   * // Get suggestions for 'neuro':
   * miniSearch.autoSuggest('neuro')
   * // => [ { suggestion: 'neuromancer', terms: [ 'neuromancer' ], score: 0.46240 } ]
   * ```
   *
   * ### Multiple words:
   *
   * ```javascript
   * // Get suggestions for 'zen ar':
   * miniSearch.autoSuggest('zen ar')
   * // => [
   * //  { suggestion: 'zen archery art', terms: [ 'zen', 'archery', 'art' ], score: 1.73332 },
   * //  { suggestion: 'zen art', terms: [ 'zen', 'art' ], score: 1.21313 }
   * // ]
   * ```
   *
   * ### Fuzzy suggestions:
   *
   * ```javascript
   * // Correct spelling mistakes using fuzzy search:
   * miniSearch.autoSuggest('neromancer', { fuzzy: 0.2 })
   * // => [ { suggestion: 'neuromancer', terms: [ 'neuromancer' ], score: 1.03998 } ]
   * ```
   *
   * ### Filtering:
   *
   * ```javascript
   * // Get suggestions for 'zen ar', but only within the 'fiction' category
   * // (assuming that 'category' is a stored field):
   * miniSearch.autoSuggest('zen ar', {
   *   filter: (result) => result.category === 'fiction'
   * })
   * // => [
   * //  { suggestion: 'zen archery art', terms: [ 'zen', 'archery', 'art' ], score: 1.73332 },
   * //  { suggestion: 'zen art', terms: [ 'zen', 'art' ], score: 1.21313 }
   * // ]
   * ```
   *
   * @param queryString  Query string to be expanded into suggestions
   * @param options  Search options. The supported options and default values
   * are the same as for the {@link MiniSearch#search} method, except that by
   * default prefix search is performed on the last term in the query, and terms
   * are combined with `'AND'`.
   * @return  A sorted array of suggestions sorted by relevance score.
   */
  autoSuggest(queryString, options = {}) {
    options = { ...this._options.autoSuggestOptions, ...options };
    let suggestions = /* @__PURE__ */ new Map();
    for (let { score, terms } of this.search(queryString, options)) {
      let phrase = terms.join(" "), suggestion = suggestions.get(phrase);
      suggestion != null ? (suggestion.score += score, suggestion.count += 1) : suggestions.set(phrase, { score, terms, count: 1 });
    }
    let results = [];
    for (let [suggestion, { score, terms, count }] of suggestions)
      results.push({ suggestion, terms, score: score / count });
    return results.sort(byScore), results;
  }
  /**
   * Total number of documents available to search
   */
  get documentCount() {
    return this._documentCount;
  }
  /**
   * Number of terms in the index
   */
  get termCount() {
    return this._index.size;
  }
  /**
   * Deserializes a JSON index (serialized with `JSON.stringify(miniSearch)`)
   * and instantiates a MiniSearch instance. It should be given the same options
   * originally used when serializing the index.
   *
   * ### Usage:
   *
   * ```javascript
   * // If the index was serialized with:
   * let miniSearch = new MiniSearch({ fields: ['title', 'text'] })
   * miniSearch.addAll(documents)
   *
   * const json = JSON.stringify(miniSearch)
   * // It can later be deserialized like this:
   * miniSearch = MiniSearch.loadJSON(json, { fields: ['title', 'text'] })
   * ```
   *
   * @param json  JSON-serialized index
   * @param options  configuration options, same as the constructor
   * @return An instance of MiniSearch deserialized from the given JSON.
   */
  static loadJSON(json2, options) {
    if (options == null)
      throw new Error("MiniSearch: loadJSON should be given the same options used when serializing the index");
    return this.loadJS(JSON.parse(json2), options);
  }
  /**
   * Async equivalent of {@link MiniSearch.loadJSON}
   *
   * This function is an alternative to {@link MiniSearch.loadJSON} that returns
   * a promise, and loads the index in batches, leaving pauses between them to avoid
   * blocking the main thread. It tends to be slower than the synchronous
   * version, but does not block the main thread, so it can be a better choice
   * when deserializing very large indexes.
   *
   * @param json  JSON-serialized index
   * @param options  configuration options, same as the constructor
   * @return A Promise that will resolve to an instance of MiniSearch deserialized from the given JSON.
   */
  static async loadJSONAsync(json2, options) {
    if (options == null)
      throw new Error("MiniSearch: loadJSON should be given the same options used when serializing the index");
    return this.loadJSAsync(JSON.parse(json2), options);
  }
  /**
   * Returns the default value of an option. It will throw an error if no option
   * with the given name exists.
   *
   * @param optionName  Name of the option
   * @return The default value of the given option
   *
   * ### Usage:
   *
   * ```javascript
   * // Get default tokenizer
   * MiniSearch.getDefault('tokenize')
   *
   * // Get default term processor
   * MiniSearch.getDefault('processTerm')
   *
   * // Unknown options will throw an error
   * MiniSearch.getDefault('notExisting')
   * // => throws 'MiniSearch: unknown option "notExisting"'
   * ```
   */
  static getDefault(optionName) {
    if (defaultOptions.hasOwnProperty(optionName))
      return getOwnProperty(defaultOptions, optionName);
    throw new Error(`MiniSearch: unknown option "${optionName}"`);
  }
  /**
   * @ignore
   */
  static loadJS(js, options) {
    let { index, documentIds, fieldLength, storedFields, serializationVersion } = js, miniSearch = this.instantiateMiniSearch(js, options);
    miniSearch._documentIds = objectToNumericMap(documentIds), miniSearch._fieldLength = objectToNumericMap(fieldLength), miniSearch._storedFields = objectToNumericMap(storedFields);
    for (let [shortId, id] of miniSearch._documentIds)
      miniSearch._idToShortId.set(id, shortId);
    for (let [term, data] of index) {
      let dataMap = /* @__PURE__ */ new Map();
      for (let fieldId of Object.keys(data)) {
        let indexEntry = data[fieldId];
        serializationVersion === 1 && (indexEntry = indexEntry.ds), dataMap.set(parseInt(fieldId, 10), objectToNumericMap(indexEntry));
      }
      miniSearch._index.set(term, dataMap);
    }
    return miniSearch;
  }
  /**
   * @ignore
   */
  static async loadJSAsync(js, options) {
    let { index, documentIds, fieldLength, storedFields, serializationVersion } = js, miniSearch = this.instantiateMiniSearch(js, options);
    miniSearch._documentIds = await objectToNumericMapAsync(documentIds), miniSearch._fieldLength = await objectToNumericMapAsync(fieldLength), miniSearch._storedFields = await objectToNumericMapAsync(storedFields);
    for (let [shortId, id] of miniSearch._documentIds)
      miniSearch._idToShortId.set(id, shortId);
    let count = 0;
    for (let [term, data] of index) {
      let dataMap = /* @__PURE__ */ new Map();
      for (let fieldId of Object.keys(data)) {
        let indexEntry = data[fieldId];
        serializationVersion === 1 && (indexEntry = indexEntry.ds), dataMap.set(parseInt(fieldId, 10), await objectToNumericMapAsync(indexEntry));
      }
      ++count % 1e3 === 0 && await wait(0), miniSearch._index.set(term, dataMap);
    }
    return miniSearch;
  }
  /**
   * @ignore
   */
  static instantiateMiniSearch(js, options) {
    let { documentCount, nextId, fieldIds, averageFieldLength, dirtCount, serializationVersion } = js;
    if (serializationVersion !== 1 && serializationVersion !== 2)
      throw new Error("MiniSearch: cannot deserialize an index created with an incompatible version");
    let miniSearch = new _MiniSearch(options);
    return miniSearch._documentCount = documentCount, miniSearch._nextId = nextId, miniSearch._idToShortId = /* @__PURE__ */ new Map(), miniSearch._fieldIds = fieldIds, miniSearch._avgFieldLength = averageFieldLength, miniSearch._dirtCount = dirtCount || 0, miniSearch._index = new SearchableMap(), miniSearch;
  }
  /**
   * @ignore
   */
  executeQuery(query, searchOptions = {}) {
    if (query === _MiniSearch.wildcard)
      return this.executeWildcardQuery(searchOptions);
    if (typeof query != "string") {
      let options2 = { ...searchOptions, ...query, queries: void 0 }, results2 = query.queries.map((subquery) => this.executeQuery(subquery, options2));
      return this.combineResults(results2, options2.combineWith);
    }
    let { tokenize: tokenize2, processTerm, searchOptions: globalSearchOptions } = this._options, options = { tokenize: tokenize2, processTerm, ...globalSearchOptions, ...searchOptions }, { tokenize: searchTokenize, processTerm: searchProcessTerm } = options, results = searchTokenize(query).flatMap((term) => searchProcessTerm(term)).filter((term) => !!term).map(termToQuerySpec(options)).map((query2) => this.executeQuerySpec(query2, options));
    return this.combineResults(results, options.combineWith);
  }
  /**
   * @ignore
   */
  executeQuerySpec(query, searchOptions) {
    let options = { ...this._options.searchOptions, ...searchOptions }, boosts = (options.fields || this._options.fields).reduce((boosts2, field) => ({ ...boosts2, [field]: getOwnProperty(options.boost, field) || 1 }), {}), { boostDocument, weights, maxFuzzy, bm25: bm25params } = options, { fuzzy: fuzzyWeight, prefix: prefixWeight } = { ...defaultSearchOptions.weights, ...weights }, data = this._index.get(query.term), results = this.termResults(query.term, query.term, 1, query.termBoost, data, boosts, boostDocument, bm25params), prefixMatches, fuzzyMatches;
    if (query.prefix && (prefixMatches = this._index.atPrefix(query.term)), query.fuzzy) {
      let fuzzy = query.fuzzy === !0 ? 0.2 : query.fuzzy, maxDistance = fuzzy < 1 ? Math.min(maxFuzzy, Math.round(query.term.length * fuzzy)) : fuzzy;
      maxDistance && (fuzzyMatches = this._index.fuzzyGet(query.term, maxDistance));
    }
    if (prefixMatches)
      for (let [term, data2] of prefixMatches) {
        let distance = term.length - query.term.length;
        if (!distance)
          continue;
        fuzzyMatches?.delete(term);
        let weight = prefixWeight * term.length / (term.length + 0.3 * distance);
        this.termResults(query.term, term, weight, query.termBoost, data2, boosts, boostDocument, bm25params, results);
      }
    if (fuzzyMatches)
      for (let term of fuzzyMatches.keys()) {
        let [data2, distance] = fuzzyMatches.get(term);
        if (!distance)
          continue;
        let weight = fuzzyWeight * term.length / (term.length + distance);
        this.termResults(query.term, term, weight, query.termBoost, data2, boosts, boostDocument, bm25params, results);
      }
    return results;
  }
  /**
   * @ignore
   */
  executeWildcardQuery(searchOptions) {
    let results = /* @__PURE__ */ new Map(), options = { ...this._options.searchOptions, ...searchOptions };
    for (let [shortId, id] of this._documentIds) {
      let score = options.boostDocument ? options.boostDocument(id, "", this._storedFields.get(shortId)) : 1;
      results.set(shortId, {
        score,
        terms: [],
        match: {}
      });
    }
    return results;
  }
  /**
   * @ignore
   */
  combineResults(results, combineWith = OR) {
    if (results.length === 0)
      return /* @__PURE__ */ new Map();
    let operator = combineWith.toLowerCase(), combinator = combinators[operator];
    if (!combinator)
      throw new Error(`Invalid combination operator: ${combineWith}`);
    return results.reduce(combinator) || /* @__PURE__ */ new Map();
  }
  /**
   * Allows serialization of the index to JSON, to possibly store it and later
   * deserialize it with {@link MiniSearch.loadJSON}.
   *
   * Normally one does not directly call this method, but rather call the
   * standard JavaScript `JSON.stringify()` passing the {@link MiniSearch}
   * instance, and JavaScript will internally call this method. Upon
   * deserialization, one must pass to {@link MiniSearch.loadJSON} the same
   * options used to create the original instance that was serialized.
   *
   * ### Usage:
   *
   * ```javascript
   * // Serialize the index:
   * let miniSearch = new MiniSearch({ fields: ['title', 'text'] })
   * miniSearch.addAll(documents)
   * const json = JSON.stringify(miniSearch)
   *
   * // Later, to deserialize it:
   * miniSearch = MiniSearch.loadJSON(json, { fields: ['title', 'text'] })
   * ```
   *
   * @return A plain-object serializable representation of the search index.
   */
  toJSON() {
    let index = [];
    for (let [term, fieldIndex] of this._index) {
      let data = {};
      for (let [fieldId, freqs] of fieldIndex)
        data[fieldId] = Object.fromEntries(freqs);
      index.push([term, data]);
    }
    return {
      documentCount: this._documentCount,
      nextId: this._nextId,
      documentIds: Object.fromEntries(this._documentIds),
      fieldIds: this._fieldIds,
      fieldLength: Object.fromEntries(this._fieldLength),
      averageFieldLength: this._avgFieldLength,
      storedFields: Object.fromEntries(this._storedFields),
      dirtCount: this._dirtCount,
      index,
      serializationVersion: 2
    };
  }
  /**
   * @ignore
   */
  termResults(sourceTerm, derivedTerm, termWeight, termBoost, fieldTermData, fieldBoosts, boostDocumentFn, bm25params, results = /* @__PURE__ */ new Map()) {
    if (fieldTermData == null)
      return results;
    for (let field of Object.keys(fieldBoosts)) {
      let fieldBoost = fieldBoosts[field], fieldId = this._fieldIds[field], fieldTermFreqs = fieldTermData.get(fieldId);
      if (fieldTermFreqs == null)
        continue;
      let matchingFields = fieldTermFreqs.size, avgFieldLength = this._avgFieldLength[fieldId];
      for (let docId of fieldTermFreqs.keys()) {
        if (!this._documentIds.has(docId)) {
          this.removeTerm(fieldId, docId, derivedTerm), matchingFields -= 1;
          continue;
        }
        let docBoost = boostDocumentFn ? boostDocumentFn(this._documentIds.get(docId), derivedTerm, this._storedFields.get(docId)) : 1;
        if (!docBoost)
          continue;
        let termFreq = fieldTermFreqs.get(docId), fieldLength = this._fieldLength.get(docId)[fieldId], rawScore = calcBM25Score(termFreq, matchingFields, this._documentCount, fieldLength, avgFieldLength, bm25params), weightedScore = termWeight * termBoost * fieldBoost * docBoost * rawScore, result = results.get(docId);
        if (result) {
          result.score += weightedScore, assignUniqueTerm(result.terms, sourceTerm);
          let match = getOwnProperty(result.match, derivedTerm);
          match ? match.push(field) : result.match[derivedTerm] = [field];
        } else
          results.set(docId, {
            score: weightedScore,
            terms: [sourceTerm],
            match: { [derivedTerm]: [field] }
          });
      }
    }
    return results;
  }
  /**
   * @ignore
   */
  addTerm(fieldId, documentId, term) {
    let indexData = this._index.fetch(term, createMap), fieldIndex = indexData.get(fieldId);
    if (fieldIndex == null)
      fieldIndex = /* @__PURE__ */ new Map(), fieldIndex.set(documentId, 1), indexData.set(fieldId, fieldIndex);
    else {
      let docs = fieldIndex.get(documentId);
      fieldIndex.set(documentId, (docs || 0) + 1);
    }
  }
  /**
   * @ignore
   */
  removeTerm(fieldId, documentId, term) {
    if (!this._index.has(term)) {
      this.warnDocumentChanged(documentId, fieldId, term);
      return;
    }
    let indexData = this._index.fetch(term, createMap), fieldIndex = indexData.get(fieldId);
    fieldIndex == null || fieldIndex.get(documentId) == null ? this.warnDocumentChanged(documentId, fieldId, term) : fieldIndex.get(documentId) <= 1 ? fieldIndex.size <= 1 ? indexData.delete(fieldId) : fieldIndex.delete(documentId) : fieldIndex.set(documentId, fieldIndex.get(documentId) - 1), this._index.get(term).size === 0 && this._index.delete(term);
  }
  /**
   * @ignore
   */
  warnDocumentChanged(shortDocumentId, fieldId, term) {
    for (let fieldName of Object.keys(this._fieldIds))
      if (this._fieldIds[fieldName] === fieldId) {
        this._options.logger("warn", `MiniSearch: document with ID ${this._documentIds.get(shortDocumentId)} has changed before removal: term "${term}" was not present in field "${fieldName}". Removing a document after it has changed can corrupt the index!`, "version_conflict");
        return;
      }
  }
  /**
   * @ignore
   */
  addDocumentId(documentId) {
    let shortDocumentId = this._nextId;
    return this._idToShortId.set(documentId, shortDocumentId), this._documentIds.set(shortDocumentId, documentId), this._documentCount += 1, this._nextId += 1, shortDocumentId;
  }
  /**
   * @ignore
   */
  addFields(fields) {
    for (let i = 0; i < fields.length; i++)
      this._fieldIds[fields[i]] = i;
  }
  /**
   * @ignore
   */
  addFieldLength(documentId, fieldId, count, length) {
    let fieldLengths = this._fieldLength.get(documentId);
    fieldLengths == null && this._fieldLength.set(documentId, fieldLengths = []), fieldLengths[fieldId] = length;
    let totalFieldLength = (this._avgFieldLength[fieldId] || 0) * count + length;
    this._avgFieldLength[fieldId] = totalFieldLength / (count + 1);
  }
  /**
   * @ignore
   */
  removeFieldLength(documentId, fieldId, count, length) {
    if (count === 1) {
      this._avgFieldLength[fieldId] = 0;
      return;
    }
    let totalFieldLength = this._avgFieldLength[fieldId] * count - length;
    this._avgFieldLength[fieldId] = totalFieldLength / (count - 1);
  }
  /**
   * @ignore
   */
  saveStoredFields(documentId, doc) {
    let { storeFields, extractField } = this._options;
    if (storeFields == null || storeFields.length === 0)
      return;
    let documentFields = this._storedFields.get(documentId);
    documentFields == null && this._storedFields.set(documentId, documentFields = {});
    for (let fieldName of storeFields) {
      let fieldValue = extractField(doc, fieldName);
      fieldValue !== void 0 && (documentFields[fieldName] = fieldValue);
    }
  }
};
MiniSearch.wildcard = Symbol("*");
var getOwnProperty = (object, property) => Object.prototype.hasOwnProperty.call(object, property) ? object[property] : void 0, combinators = {
  [OR]: (a, b) => {
    for (let docId of b.keys()) {
      let existing = a.get(docId);
      if (existing == null)
        a.set(docId, b.get(docId));
      else {
        let { score, terms, match } = b.get(docId);
        existing.score = existing.score + score, existing.match = Object.assign(existing.match, match), assignUniqueTerms(existing.terms, terms);
      }
    }
    return a;
  },
  [AND]: (a, b) => {
    let combined = /* @__PURE__ */ new Map();
    for (let docId of b.keys()) {
      let existing = a.get(docId);
      if (existing == null)
        continue;
      let { score, terms, match } = b.get(docId);
      assignUniqueTerms(existing.terms, terms), combined.set(docId, {
        score: existing.score + score,
        terms: existing.terms,
        match: Object.assign(existing.match, match)
      });
    }
    return combined;
  },
  [AND_NOT]: (a, b) => {
    for (let docId of b.keys())
      a.delete(docId);
    return a;
  }
}, defaultBM25params = { k: 1.2, b: 0.7, d: 0.5 }, calcBM25Score = (termFreq, matchingCount, totalCount, fieldLength, avgFieldLength, bm25params) => {
  let { k, b, d } = bm25params;
  return Math.log(1 + (totalCount - matchingCount + 0.5) / (matchingCount + 0.5)) * (d + termFreq * (k + 1) / (termFreq + k * (1 - b + b * fieldLength / avgFieldLength)));
}, termToQuerySpec = (options) => (term, i, terms) => {
  let fuzzy = typeof options.fuzzy == "function" ? options.fuzzy(term, i, terms) : options.fuzzy || !1, prefix = typeof options.prefix == "function" ? options.prefix(term, i, terms) : options.prefix === !0, termBoost = typeof options.boostTerm == "function" ? options.boostTerm(term, i, terms) : 1;
  return { term, fuzzy, prefix, termBoost };
}, defaultOptions = {
  idField: "id",
  extractField: (document, fieldName) => document[fieldName],
  stringifyField: (fieldValue, fieldName) => fieldValue.toString(),
  tokenize: (text) => text.split(SPACE_OR_PUNCTUATION),
  processTerm: (term) => term.toLowerCase(),
  fields: void 0,
  searchOptions: void 0,
  storeFields: [],
  logger: (level, message) => {
    typeof console?.[level] == "function" && console[level](message);
  },
  autoVacuum: !0
}, defaultSearchOptions = {
  combineWith: OR,
  prefix: !1,
  fuzzy: !1,
  maxFuzzy: 6,
  boost: {},
  weights: { fuzzy: 0.45, prefix: 0.375 },
  bm25: defaultBM25params
}, defaultAutoSuggestOptions = {
  combineWith: AND,
  prefix: (term, i, terms) => i === terms.length - 1
}, defaultVacuumOptions = { batchSize: 1e3, batchWait: 10 }, defaultVacuumConditions = { minDirtFactor: 0.1, minDirtCount: 20 }, defaultAutoVacuumOptions = { ...defaultVacuumOptions, ...defaultVacuumConditions }, assignUniqueTerm = (target, term) => {
  target.includes(term) || target.push(term);
}, assignUniqueTerms = (target, source) => {
  for (let term of source)
    target.includes(term) || target.push(term);
}, byScore = ({ score: a }, { score: b }) => b - a, createMap = () => /* @__PURE__ */ new Map(), objectToNumericMap = (object) => {
  let map2 = /* @__PURE__ */ new Map();
  for (let key of Object.keys(object))
    map2.set(parseInt(key, 10), object[key]);
  return map2;
}, objectToNumericMapAsync = async (object) => {
  let map2 = /* @__PURE__ */ new Map(), count = 0;
  for (let key of Object.keys(object))
    map2.set(parseInt(key, 10), object[key]), ++count % 1e3 === 0 && await wait(0);
  return map2;
}, wait = (ms) => new Promise((resolve11) => setTimeout(resolve11, ms)), SPACE_OR_PUNCTUATION = /[\n\r\p{Z}\p{P}]+/u;

// ../../packages/core/src/search/cjk-tokenizer.ts
var CJK_RANGES = [
  [19968, 40959],
  // CJK Unified Ideographs
  [12352, 12447],
  // Hiragana
  [12448, 12543],
  // Katakana
  [44032, 55215]
  // Hangul Syllables
];
function isCjkCodePoint(codePoint) {
  return CJK_RANGES.some(([lo, hi]) => codePoint >= lo && codePoint <= hi);
}
var SPACE_OR_PUNCTUATION2 = /[\n\r\p{Z}\p{P}]+/u;
function cjkBigrams(run) {
  if (run.length <= 1) return [...run];
  let out = [];
  for (let i = 0; i < run.length - 1; i++) out.push(run[i] + run[i + 1]);
  return out;
}
function splitToken(token) {
  let out = [], run = [], runIsCjk = null, flush = () => {
    run.length !== 0 && (runIsCjk ? out.push(...cjkBigrams(run)) : out.push(run.join("")), run = []);
  };
  for (let ch of token) {
    let cjk = isCjkCodePoint(ch.codePointAt(0) ?? 0);
    runIsCjk === null || cjk === runIsCjk ? (run.push(ch), runIsCjk = cjk) : (flush(), run = [ch], runIsCjk = cjk);
  }
  return flush(), out;
}
function tokenizeWithCjk(text) {
  let out = [];
  for (let token of text.split(SPACE_OR_PUNCTUATION2))
    token.length !== 0 && out.push(...splitToken(token));
  return out;
}

// ../../packages/core/src/search/search.ts
var DAY_MS2 = 864e5, STOPWORDS = /* @__PURE__ */ new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with"
]);
function removeStopwords(tokens) {
  return tokens.filter((t) => !STOPWORDS.has(t.toLowerCase()));
}
function scoreToConfidence(score) {
  return score >= 0.6 ? "high" : score >= 0.4 ? "medium" : "low";
}
var DOC_ID_SEPARATOR = "#", MAX_ELEMENTS_PER_TOPIC = 5, SECONDARY_CONFIDENCE_FLOOR = 0.4, SECONDARY_RELATIVE_FRACTION = 0.5;
function parseDocId(docId) {
  let idx = docId.indexOf(DOC_ID_SEPARATOR);
  return idx < 0 ? { topicPath: docId, elementId: void 0 } : {
    topicPath: docId.substring(0, idx),
    elementId: docId.substring(idx + 1)
  };
}
function indexableElements(topicElements) {
  let out = [];
  for (let el of topicElements) {
    if (!isIndexedElementTag(el.tag)) continue;
    let id = el.attributes.id;
    id === void 0 || !isValidElementId(id) || out.push({ elementId: id, elementType: el.tag, text: el.text });
  }
  return out;
}
function buildSnippet(body, query) {
  let flat = body.replace(/\s+/g, " ").trim(), term = query.split(" ")[0]?.toLowerCase() ?? "", idx = term ? flat.toLowerCase().indexOf(term) : -1, start = idx > 40 ? idx - 40 : 0;
  return flat.slice(start, start + 160);
}
async function search(root, query, limit = 10, options = {}) {
  let topics = await listTopics(root);
  if (options.scope) {
    let prefix = options.scope.replace(/\.html$/i, "").replace(/\/+$/, "");
    topics = topics.filter(
      (p) => p === `${prefix}.html` || p.startsWith(`${prefix}/`)
    );
  }
  if (topics.length === 0) return [];
  let nowMs2 = options.now !== void 0 ? Date.parse(options.now) : Number.NaN, docs = [], topicMeta = /* @__PURE__ */ new Map(), elementMeta = /* @__PURE__ */ new Map(), docText = /* @__PURE__ */ new Map(), mtimes = /* @__PURE__ */ new Map(), axis = new ElementAxisIndex();
  for (let path2 of topics) {
    let topic = await readTopic(root, path2), title = topic.attributes.title ?? "", body = [topic.bodyText, topic.imageContent].filter(Boolean).join(" "), summary = topic.attributes.summary ?? "", keywords = topic.attributes.keywords ?? "";
    topicMeta.set(path2, { body: topic.bodyText, title }), axis.add(path2, topic.elements);
    let els = indexableElements(topic.elements);
    if (els.length === 0)
      docs.push({ body, id: path2, keywords, summary, title }), docText.set(
        path2,
        `${title} ${summary} ${keywords} ${body}`.toLowerCase()
      );
    else
      for (let el of els) {
        let docId = `${path2}${DOC_ID_SEPARATOR}${el.elementId}`, elementBody = [el.text, topic.imageContent].filter(Boolean).join(" ");
        docs.push({
          body: elementBody,
          id: docId,
          keywords,
          summary,
          title
        }), elementMeta.set(docId, {
          elementId: el.elementId,
          elementType: el.elementType,
          text: el.text,
          topicPath: path2
        }), docText.set(
          docId,
          `${title} ${summary} ${keywords} ${elementBody}`.toLowerCase()
        );
      }
    if (!Number.isNaN(nowMs2))
      try {
        mtimes.set(path2, (await stat4(resolveWithinTree(root, path2))).mtimeMs);
      } catch {
      }
  }
  let indexed = docs;
  if (options.elementHint) {
    let { attr, tag, value } = options.elementHint, allowed = new Set(
      attr !== void 0 && value !== void 0 ? axis.findByAttribute(tag, attr, value) : axis.findByTag(tag)
    );
    if (indexed = docs.filter((d) => {
      let { topicPath } = parseDocId(d.id);
      return allowed.has(topicPath);
    }), indexed.length === 0) return [];
  }
  let mini = new MiniSearch({
    fields: ["title", "summary", "keywords", "body"],
    storeFields: ["title"],
    tokenize: tokenizeWithCjk,
    searchOptions: {
      boost: { title: 3, summary: 2, keywords: 2 },
      fuzzy: 0.2,
      prefix: !0
    }
  });
  mini.addAll(indexed);
  let tokens = query.split(/\s+/).filter(Boolean), cleaned = removeStopwords(tokens).join(" ") || query, raw = mini.search(cleaned);
  if (raw.length === 0) return [];
  let significant = cleaned.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [], inDomain = significant.length > 0 ? raw.filter((r) => {
    let text = docText.get(r.id) ?? "";
    return significant.some((t) => text.includes(t));
  }) : raw;
  if (inDomain.length === 0) return [];
  let maxRawScore = inDomain[0]?.score ?? 1, allTopicPaths = Array.from(
    new Set(inDomain.map((r) => parseDocId(r.id).topicPath))
  ), signals = await getManySignals(root, allTopicPaths), scored = inDomain.map((r) => {
    let docId = r.id, { topicPath, elementId } = parseDocId(docId), elMeta = elementMeta.get(docId), sig = signals.get(topicPath) ?? createDefaultRuntimeSignals(), mtime = mtimes.get(topicPath);
    !Number.isNaN(nowMs2) && mtime !== void 0 && (sig = applyDecay(sig, (nowMs2 - mtime) / DAY_MS2));
    let normalized = maxRawScore > 0 ? r.score / maxRawScore : 0, score = compoundScore(normalized, sig);
    return {
      docId,
      elementId,
      elementType: elMeta?.elementType,
      score,
      topicPath
    };
  }), byTopic = /* @__PURE__ */ new Map();
  for (let s of scored) {
    let arr = byTopic.get(s.topicPath);
    arr ? arr.push(s) : byTopic.set(s.topicPath, [s]);
  }
  let hits = [];
  for (let [topicPath, group] of byTopic) {
    group.sort((a, b) => b.score - a.score);
    let primary = group[0];
    if (!primary) continue;
    let minSecondary = Math.max(
      SECONDARY_CONFIDENCE_FLOOR,
      SECONDARY_RELATIVE_FRACTION * primary.score
    ), secondaries = group.slice(1).filter((s) => s.score >= minSecondary && s.elementId !== void 0).slice(0, MAX_ELEMENTS_PER_TOPIC - 1).map((s) => s.elementId), meta = topicMeta.get(topicPath) ?? { body: "", title: "" }, snippetSource = elementMeta.get(primary.docId)?.text ?? meta.body;
    hits.push({
      confidence: scoreToConfidence(primary.score),
      path: topicPath,
      score: primary.score,
      snippet: buildSnippet(snippetSource, cleaned),
      title: meta.title,
      ...primary.elementId !== void 0 ? { topElementId: primary.elementId } : {},
      ...primary.elementType !== void 0 ? { topElementType: primary.elementType } : {},
      ...secondaries.length > 0 ? { additionalElementIds: secondaries } : {}
    });
  }
  return hits.sort((a, b) => b.score - a.score), hits.slice(0, limit);
}

// ../../packages/core/src/citation/format.ts
var MAX_HITS = 3, HEADER = "\u{1F4DA} From ByteRover:", RECALL_COUNT_THRESHOLD = 2, SNIPPET_MAX_CHARS = 80, SHORT_PARTIAL_PREFIX_MAX = 4, RECENTLY_UPDATED_DAYS = 30, MS_PER_DAY = 1440 * 60 * 1e3, MAX_ELEMENT_IDS_PER_URL = 5;
function encodeTopicPath(topicPath) {
  return `context-tree/${topicPath.split("/").map((seg) => encodeURIComponent(seg)).join("/")}`;
}
function citationScheme() {
  return process.env.BRV_DEEPLINK_SCHEME?.trim() === "byterover-dev" ? "byterover-dev" : "byterover";
}
function topicInspectUrl(webBaseUrl, spaceId, topicPath, elementIds = []) {
  let origin = webBaseUrl.replace(/\/+$/, ""), route = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(origin) ? "v" : "i", base = `${origin}/${route}/topic/${encodeURIComponent(spaceId)}/${encodeTopicPath(topicPath)}`, fragment = buildElementFragment(elementIds), schemeQuery = route === "i" && citationScheme() === "byterover-dev" ? `?scheme=${encodeURIComponent("byterover-dev")}` : "", fragmentPart = fragment.length > 0 ? `#${fragment}` : "";
  return `${base}${schemeQuery}${fragmentPart}`;
}
function buildElementFragment(elementIds) {
  let seen = /* @__PURE__ */ new Set(), bodies = [];
  for (let id of elementIds)
    if (!(!isValidElementId(id) || seen.has(id)) && (seen.add(id), bodies.push(id.substring(ELEMENT_ID_PREFIX.length)), bodies.length >= MAX_ELEMENT_IDS_PER_URL))
      break;
  return bodies.length === 0 ? "" : `${ELEMENT_ID_PREFIX}${bodies.join(",")}`;
}
function elementKind(tag) {
  return tag.startsWith("bv-") ? tag.substring(3) : tag;
}
function shouldCite(hits) {
  return hits.length === 0 ? !1 : hits.some(
    (h) => h.confidence === "high" || h.confidence === "medium"
  );
}
function formatCitationBlock(hits, options) {
  let maxHits = options.maxHits ?? MAX_HITS, usable = hits.filter(
    (h) => h.confidence === "high" || h.confidence === "medium"
  ).slice(0, maxHits);
  if (usable.length === 0) return "";
  let lines = usable.flatMap((h) => formatLines(h, options));
  return [HEADER, ...lines].join(`
`);
}
function formatSnippet(snippet2) {
  let collapsed = snippet2.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "";
  let body = collapsed, prefix = "", partial = body.match(
    new RegExp(`^([a-z]{1,${SHORT_PARTIAL_PREFIX_MAX}}[^A-Za-z]?)\\s+`)
  );
  if (partial ? (body = body.slice(partial[0].length), prefix = "\u2026") : /^[a-z]/.test(body) && (prefix = "\u2026"), body.length === 0) return prefix;
  let budget = SNIPPET_MAX_CHARS - prefix.length;
  return body.length <= budget ? prefix + body : `${prefix}${body.slice(0, budget - 1).trimEnd()}\u2026`;
}
function relativeDays(ageMs) {
  let days = Math.floor(ageMs / MS_PER_DAY);
  return days >= RECENTLY_UPDATED_DAYS ? null : days <= 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`;
}
function formatLines(hit, options) {
  let baseTitle = hit.title.trim().length > 0 ? hit.title : hit.path, titleWithKind = hit.topElementType !== void 0 ? `${baseTitle} (${elementKind(hit.topElementType)})` : baseTitle, titleContent = hit.accessCount !== void 0 && hit.accessCount >= RECALL_COUNT_THRESHOLD ? `${titleWithKind}  \xB7  Recalled ${hit.accessCount}\xD7` : titleWithKind, titleLine;
  if (options.webBaseUrl !== null) {
    let elementIds = [];
    hit.topElementId !== void 0 && elementIds.push(hit.topElementId), hit.additionalElementIds !== void 0 && elementIds.push(...hit.additionalElementIds);
    let url = topicInspectUrl(
      options.webBaseUrl,
      options.spaceId,
      hit.path,
      elementIds
    );
    titleLine = `- [${escapeMarkdownLinkText(titleContent)}](${url})`;
  } else
    titleLine = `- ${titleContent}`;
  let out = [titleLine];
  if (hit.snippet !== void 0) {
    let snippet2 = formatSnippet(hit.snippet);
    snippet2.length > 0 && out.push(`    "${snippet2}"`);
  }
  if (hit.updatedAt !== void 0 && hit.updatedBy !== void 0) {
    let updatedMs = Date.parse(hit.updatedAt);
    if (!Number.isNaN(updatedMs)) {
      let nowMs2 = options.nowMs ?? Date.now(), relative3 = relativeDays(nowMs2 - updatedMs);
      relative3 !== null && out.push(`    Updated by ${hit.updatedBy} \xB7 ${relative3}`);
    }
  }
  return out;
}
function escapeMarkdownLinkText(s) {
  return s.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

// ../../packages/core/src/tree/history.ts
import { mkdir as mkdir6, readFile as readFile10, rename as rename5, rm as rm9, writeFile as writeFile5 } from "node:fs/promises";
import { join as join12, resolve as resolve5 } from "node:path";
var HISTORY_FILENAME = "history.jsonl";
function historyDir() {
  return getGlobalDataDir();
}
function historyPath() {
  return join12(historyDir(), HISTORY_FILENAME);
}
function isHistoryEntry(value) {
  if (typeof value != "object" || value === null) return !1;
  let v = value;
  return typeof v.project == "string" && typeof v.firstSeen == "string" && typeof v.lastSeen == "string";
}
async function listProjectHistory() {
  let raw;
  try {
    raw = await readFile10(historyPath(), "utf8");
  } catch (err) {
    return isErrnoCode3(err, "ENOENT") ? [] : (console.warn(
      `[byterover] Could not read ${historyPath()}: ${describeErr2(err)}`
    ), []);
  }
  let out = [], lines = raw.split(`
`);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i] ?? "";
    if (line.length === 0) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      console.warn(
        `[byterover] Skipping malformed line ${i + 1} in ${historyPath()}`
      );
      continue;
    }
    if (!isHistoryEntry(parsed)) {
      console.warn(
        `[byterover] Skipping line ${i + 1} in ${historyPath()} \u2014 missing required fields`
      );
      continue;
    }
    out.push(parsed);
  }
  return out;
}
function isErrnoCode3(err, code) {
  return typeof err == "object" && err !== null && "code" in err && err.code === code;
}
function describeErr2(err) {
  return err instanceof Error ? err.message : String(err);
}

// ../../packages/core/src/tree/display-name.ts
var InvalidDisplayNameError = class extends Error {
  constructor(reason) {
    super(`Invalid display name: ${reason}`);
    this.reason = reason;
    this.name = "InvalidDisplayNameError";
  }
};
function validateSpaceDisplayName(name) {
  if (typeof name != "string")
    throw new InvalidDisplayNameError(
      `must be a string (got ${typeof name})`
    );
  if (name.length === 0)
    throw new InvalidDisplayNameError("must not be empty");
  if (name.length > 100)
    throw new InvalidDisplayNameError(
      `must be at most 100 characters (got ${name.length})`
    );
  if (name !== name.trim())
    throw new InvalidDisplayNameError(
      "must not begin or end with whitespace"
    );
  if (/[\x00-\x1f\x7f]/.test(name))
    throw new InvalidDisplayNameError(
      "must not contain control characters"
    );
  if (name.includes("/") || name.includes("\\"))
    throw new InvalidDisplayNameError(
      "must not contain path separators ('/' or '\\\\')"
    );
}

// ../../packages/core/src/tree/marker.ts
var MARKER_FILENAME = ".brvspace", InvalidMarkerError = class extends Error {
  constructor(reason) {
    super(`Invalid .brvspace marker: ${reason}`);
    this.reason = reason;
    this.name = "InvalidMarkerError";
  }
};
function parseMarker(content) {
  let raw;
  try {
    raw = JSON.parse(content);
  } catch (err) {
    throw new InvalidMarkerError(
      `not valid JSON (${err.message})`
    );
  }
  if (typeof raw != "object" || raw === null || Array.isArray(raw))
    throw new InvalidMarkerError(
      "root must be a JSON object (got " + (raw === null ? "null" : Array.isArray(raw) ? "array" : typeof raw) + ")"
    );
  let obj = raw, space_id = obj.space_id;
  if (space_id === void 0)
    throw new InvalidMarkerError("missing 'space_id' field");
  if (!isUuid(space_id))
    throw new InvalidMarkerError(
      "'space_id' must be a UUID string"
    );
  let space_name = obj.space_name;
  if (space_name === void 0)
    throw new InvalidMarkerError("missing 'space_name' field");
  try {
    validateSpaceDisplayName(space_name);
  } catch (err) {
    throw new InvalidMarkerError(
      `'space_name' ${err.message.replace(/^Invalid display name: /, "")}`
    );
  }
  return { space_id, space_name };
}

// ../../packages/core/src/tree/marker-io.ts
import { randomBytes as randomBytes4 } from "node:crypto";
import { readFile as readFile11, rename as rename6, rm as rm10, writeFile as writeFile6 } from "node:fs/promises";
import { join as join13, resolve as resolve6 } from "node:path";
async function writeMarker(cwd, marker) {
  if (!isUuid(marker.space_id))
    throw new Error("writeMarker: space_id must be a UUID string");
  validateSpaceDisplayName(marker.space_name);
  let target = join13(resolve6(cwd), MARKER_FILENAME), tmp = `${target}.tmp.${randomBytes4(6).toString("hex")}`, serialized = `${JSON.stringify(marker, null, 2)}
`;
  try {
    await writeFile6(tmp, serialized, "utf8"), await rename6(tmp, target);
  } catch (err) {
    throw await rm10(tmp, { force: !0 }).catch(() => {
    }), err;
  }
}
async function readMarkerAt(cwd) {
  let target = join13(resolve6(cwd), MARKER_FILENAME);
  try {
    let content = await readFile11(target, "utf8");
    return parseMarker(content);
  } catch (err) {
    if (isErrnoCode4(err, "ENOENT")) return null;
    throw err;
  }
}
function isErrnoCode4(err, code) {
  return typeof err == "object" && err !== null && "code" in err && err.code === code;
}

// ../../packages/core/src/tree/space-resolver.ts
import { access, mkdir as mkdir7, readFile as readFile12 } from "node:fs/promises";
import { dirname as dirname7, join as join14, resolve as resolve7 } from "node:path";
var NoDefaultSpaceError = class extends Error {
  constructor() {
    super(
      "No default space configured. Open the ByteRover desktop app to create one, or pass a space_id explicitly."
    ), this.name = "NoDefaultSpaceError";
  }
}, SpaceDeletedError = class extends Error {
  constructor(space_id, hard) {
    super(
      hard ? `Space "${space_id}" was permanently deleted. There is no recovery path; create a new space and re-curate.` : `Space "${space_id}" is soft-deleted. Run \`space restore ${space_id}\` to recover.`
    );
    this.space_id = space_id;
    this.hard = hard;
    this.name = "SpaceDeletedError";
  }
};
async function resolveSpace(cwd = process.cwd()) {
  let canonicalCwd = resolve7(cwd), marker = await findMarker(canonicalCwd);
  if (marker !== null)
    return {
      ...await checkDeleted(marker.marker.space_id),
      markerPath: marker.path,
      source: "marker",
      space_id: marker.marker.space_id,
      space_name: marker.marker.space_name
    };
  let binding = await findBindingForCwd(canonicalCwd);
  if (binding !== null)
    return {
      ...await checkDeleted(binding.space_id),
      bindingFolder: binding.folder,
      source: "registry",
      space_id: binding.space_id
    };
  let defaultId = await getDefaultSpaceId();
  if (defaultId === null) throw new NoDefaultSpaceError();
  return { ...await checkDeleted(defaultId), source: "default", space_id: defaultId };
}
async function checkDeleted(space_id) {
  let deletion = await isSpaceDeleted(space_id);
  return deletion.deleted ? { deleted: { hard: deletion.hard } } : {};
}
async function findMarker(startDir) {
  let dir = startDir;
  for (; ; ) {
    let markerPath = join14(dir, MARKER_FILENAME), content = await readMarkerFile(markerPath);
    if (content !== null)
      try {
        return { marker: parseMarker(content), path: markerPath };
      } catch (err) {
        throw err instanceof InvalidMarkerError ? new InvalidMarkerError(`${err.reason} (at ${markerPath})`) : err;
      }
    let parent = dirname7(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
async function readMarkerFile(path2) {
  try {
    return await readFile12(path2, "utf8");
  } catch (err) {
    if (isErrnoCode5(err, "ENOENT") || isErrnoCode5(err, "EACCES"))
      return null;
    throw err;
  }
}
function isErrnoCode5(err, code) {
  return typeof err == "object" && err !== null && "code" in err && err.code === code;
}
async function resolveContextRoot(start = process.cwd()) {
  let resolution = await resolveSpace(start);
  if (resolution.deleted !== void 0)
    throw new SpaceDeletedError(resolution.space_id, resolution.deleted.hard);
  let root = spaceContextTreePath(resolution.space_id);
  try {
    return await access(root), root;
  } catch {
    throw new Error(
      `No context tree found for ${resolve7(start)} (space_id: "${resolution.space_id}"). Run \`space bind "<name>"\` from this folder to link it to an existing space (create one in the ByteRover desktop app first if none exists).`
    );
  }
}

// ../../packages/core/src/tree/tip-shown.ts
import { mkdir as mkdir8, readFile as readFile13, writeFile as writeFile7 } from "node:fs/promises";
import { join as join15, resolve as resolve8 } from "node:path";
var TIP_SHOWN_FILENAME = "tip-shown.json";
function tipShownDir() {
  return getGlobalDataDir();
}
function tipShownPath() {
  return join15(tipShownDir(), TIP_SHOWN_FILENAME);
}
async function hasTipBeenShown(cwd) {
  let canonicalCwd = resolve8(cwd), raw;
  try {
    raw = await readFile13(tipShownPath(), "utf8");
  } catch {
    return !1;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return !1;
  }
  return Array.isArray(parsed) ? parsed.includes(canonicalCwd) : !1;
}

// ../../packages/core/src/analytics/event-names.ts
var AnalyticsEventNames = {
  RECORD_RUN_COMPLETED: "record_run_completed",
  DREAM_COMPLETED: "dream_completed",
  QUERY_COMPLETED: "query_completed",
  READ_COMPLETED: "read_completed",
  MIGRATION_RUN_COMPLETED: "migration_run_completed",
  MIGRATION_STARTED: "migration_started",
  AUTH_STARTED: "auth_started",
  AUTH_COMPLETED: "auth_completed"
}, TASK_TYPE = {
  RECORD: "record",
  DREAM: "dream",
  QUERY: "query",
  READ: "read",
  MIGRATE: "migrate"
}, TASK_TYPE_VALUES = [
  TASK_TYPE.RECORD,
  TASK_TYPE.DREAM,
  TASK_TYPE.QUERY,
  TASK_TYPE.READ,
  TASK_TYPE.MIGRATE
], DREAM_MODES = ["merge", "link", "prune", "synthesize"];

// ../../packages/core/src/analytics/events/record-run-completed.ts
var RecordRunCompletedSchema = external_exports.object({
  duration_ms: external_exports.number().int().nonnegative(),
  /** Per-topic keyword list as parsed from `<bv-topic keywords>` CSV. */
  keywords: external_exports.array(external_exports.string().max(256)).max(50).optional(),
  /**
   * Relative topic path within the context tree (e.g. `pokemon/pikachu`).
   * Lets the shipper aggregate by topic without re-reading the row's
   * body. Omitted for failure rows where no topic was touched.
   */
  knowledge_path: external_exports.string().min(1).max(512).optional(),
  operations_added: external_exports.number().int().nonnegative(),
  operations_deleted: external_exports.number().int().nonnegative(),
  operations_failed: external_exports.number().int().nonnegative(),
  operations_merged: external_exports.number().int().nonnegative(),
  operations_updated: external_exports.number().int().nonnegative(),
  outcome: external_exports.enum(["completed", "partial", "cancelled", "error"]),
  /** Mono has no review queue — always 0 today. */
  pending_review_count: external_exports.number().int().nonnegative(),
  project_path_hash: external_exports.string().regex(/^[0-9a-f]{64}$/).optional(),
  /** Hub space, omitted in mono. */
  space_id: external_exports.string().min(1).max(64).optional(),
  /** Per-topic tag list as parsed from `<bv-topic tags>` CSV. */
  tags: external_exports.array(external_exports.string().max(256)).max(50).optional(),
  task_id: external_exports.string().min(1),
  task_type: external_exports.enum(TASK_TYPE_VALUES),
  /** Hub team, omitted in mono. */
  team_id: external_exports.string().min(1).max(64).optional(),
  /**
   * Attribution slug of the host agent that performed this run (e.g.
   * `claude`, `codex`, `cursor`, `gemini`), resolved from the CLI env
   * fingerprint (skill-runtime `resolveAgent`). Omitted when undetected.
   */
  agent: external_exports.string().regex(AGENT_SLUG_REGEX).max(64).optional(),
  /**
   * The same resolved host-agent slug as `agent`, duplicated under the
   * dashboard's canonical `agent_id` key so the activation funnel
   * (`connectors:connect_succeeded` → this event) joins on one property.
   * Kept alongside `agent` for backwards compatibility. Omitted when undetected.
   */
  agent_id: external_exports.string().regex(AGENT_SLUG_REGEX).max(64).optional(),
  /**
   * Whether this run produced a real memory WRITE — at least one add / update /
   * merge operation. A pure delete is NOT a write, and `outcome="completed"`
   * alone is NOT enough. Derived at emit time from the operation counts.
   */
  memory_write_succeeded: external_exports.boolean()
}).strict();

// ../../packages/core/src/analytics/events/dream-completed.ts
var DreamCompletedSchema = external_exports.object({
  /** How many candidate pairs / paths / clusters the engine returned. */
  candidate_count: external_exports.number().int().nonnegative(),
  /** Subset of candidate_count that surfaced as STALE (prune mode only;
   *  reason ∈ {stale-mtime, both}). Optional: omitted for merge/link/synthesize. */
  stale_candidate_count: external_exports.number().int().nonnegative().optional(),
  duration_ms: external_exports.number().int().nonnegative(),
  mode: external_exports.enum(DREAM_MODES),
  outcome: external_exports.enum(["completed", "cancelled", "error"]),
  project_path_hash: external_exports.string().regex(/^[0-9a-f]{64}$/).optional(),
  space_id: external_exports.string().min(1).max(64).optional(),
  task_id: external_exports.string().min(1),
  task_type: external_exports.enum(TASK_TYPE_VALUES),
  team_id: external_exports.string().min(1).max(64).optional(),
  /**
   * Attribution slug of the host agent that ran this dream (e.g. `claude`,
   * `codex`), resolved from the CLI env fingerprint. Omitted when undetected.
   */
  agent: external_exports.string().regex(AGENT_SLUG_REGEX).max(64).optional(),
  /**
   * The same resolved host-agent slug as `agent`, under the dashboard's
   * canonical `agent_id` key. Kept alongside `agent` for backwards
   * compatibility. Omitted when undetected.
   */
  agent_id: external_exports.string().regex(AGENT_SLUG_REGEX).max(64).optional()
}).strict();

// ../../packages/core/src/analytics/events/query-completed.ts
var RelatedPathWithMetadataSchema = external_exports.object({
  keywords: external_exports.array(external_exports.string().max(256)).max(50),
  relative_path: external_exports.string().min(1),
  tags: external_exports.array(external_exports.string().max(256)).max(50)
}).strict(), ReadPathWithMetadataSchema = external_exports.object({
  keywords: external_exports.array(external_exports.string().max(256)).max(50),
  related_paths: external_exports.array(RelatedPathWithMetadataSchema).max(50),
  relative_path: external_exports.string().min(1),
  tags: external_exports.array(external_exports.string().max(256)).max(50)
}).strict(), QueryCompletedSchema = external_exports.object({
  /** Mono has no query-result cache today; always false. */
  cache_hit: external_exports.boolean(),
  duration_ms: external_exports.number().int().nonnegative(),
  matched_doc_count: external_exports.number().int().nonnegative(),
  outcome: external_exports.enum(["completed", "cancelled", "error"]),
  project_path_hash: external_exports.string().regex(/^[0-9a-f]{64}$/).optional(),
  /** Mono can't track downstream tool calls — always 0. */
  read_doc_count: external_exports.number().int().nonnegative(),
  /**
   * One entry per returned query hit, capped at 10. Carries the hit's
   * relative path + the hit's own tags / keywords / related-paths.
   */
  read_paths_with_metadata: external_exports.array(ReadPathWithMetadataSchema).max(10).optional(),
  /** Mono can't track downstream tool calls — always 0. */
  read_tool_call_count: external_exports.number().int().nonnegative(),
  /** Mono can't track downstream tool calls — always 0. */
  search_call_count: external_exports.number().int().nonnegative(),
  space_id: external_exports.string().min(1).max(64).optional(),
  task_id: external_exports.string().min(1),
  task_type: external_exports.enum(TASK_TYPE_VALUES),
  team_id: external_exports.string().min(1).max(64).optional(),
  /** Retrieval-tier label; omitted in mono until we have tiers. */
  tier: external_exports.union([
    external_exports.literal(0),
    external_exports.literal(1),
    external_exports.literal(2),
    external_exports.literal(3),
    external_exports.literal(4)
  ]).optional(),
  /**
   * The raw query text the user (or agent) asked. Optional because rows
   * predate this field, and because a `search` invocation with no
   * positionals yields an empty string we'd rather omit. Capped at 512
   * chars at emit time; queries longer than that get a trailing `…`. The
   * Usefulness panel uses this to label the "Used for these tasks" row
   * with the actual query instead of an opaque `task_id`.
   */
  query: external_exports.string().max(512).optional(),
  /**
   * Attribution slug of the host agent that ran this query (e.g. `claude`,
   * `codex`, `cursor`, `gemini`), resolved from the CLI env fingerprint
   * (skill-runtime `resolveAgent`). Omitted when undetected.
   */
  agent: external_exports.string().regex(AGENT_SLUG_REGEX).max(64).optional(),
  /**
   * The same resolved host-agent slug as `agent`, under the dashboard's
   * canonical `agent_id` key (activation funnel join). Kept alongside `agent`
   * for backwards compatibility. Omitted when undetected.
   */
  agent_id: external_exports.string().regex(AGENT_SLUG_REGEX).max(64).optional()
}).strict();

// ../../packages/core/src/analytics/events/read-completed.ts
var RelatedPathWithMetadataSchema2 = external_exports.object({
  keywords: external_exports.array(external_exports.string().max(256)).max(50),
  relative_path: external_exports.string().min(1),
  tags: external_exports.array(external_exports.string().max(256)).max(50)
}).strict(), ReadPathWithMetadataSchema2 = external_exports.object({
  keywords: external_exports.array(external_exports.string().max(256)).max(50),
  related_paths: external_exports.array(RelatedPathWithMetadataSchema2).max(50),
  relative_path: external_exports.string().min(1),
  tags: external_exports.array(external_exports.string().max(256)).max(50)
}).strict(), ReadCompletedSchema = external_exports.object({
  duration_ms: external_exports.number().int().nonnegative(),
  /**
   * `"completed"` when the topic was read and returned; `"error"` for
   * any failure path (missing path arg, legacy guard hit, read threw).
   * No `"cancelled"` value — a direct read has no cancellation point.
   */
  outcome: external_exports.enum(["completed", "error"]),
  project_path_hash: external_exports.string().regex(/^[0-9a-f]{64}$/).optional(),
  /** `1` on a successful read, `0` on error. Mirrors the query field
   *  so downstream sums roll up cleanly across both events. */
  read_doc_count: external_exports.number().int().nonnegative(),
  /**
   * Single-entry array describing the topic that was read (its path +
   * its tags / keywords / related-paths). Omitted on error. Shape is
   * deliberately identical to `query_completed.read_paths_with_metadata`
   * so usefulness rollups can union both event streams.
   */
  read_paths_with_metadata: external_exports.array(ReadPathWithMetadataSchema2).max(1).optional(),
  space_id: external_exports.string().min(1).max(64).optional(),
  task_id: external_exports.string().min(1),
  task_type: external_exports.enum(TASK_TYPE_VALUES),
  team_id: external_exports.string().min(1).max(64).optional(),
  tier: external_exports.union([
    external_exports.literal(0),
    external_exports.literal(1),
    external_exports.literal(2),
    external_exports.literal(3),
    external_exports.literal(4)
  ]).optional(),
  /**
   * Attribution slug of the host agent that ran this read (e.g. `claude`,
   * `codex`, `cursor`, `gemini`), resolved from the CLI env fingerprint
   * (skill-runtime `resolveAgent`). Omitted when undetected.
   */
  agent: external_exports.string().regex(AGENT_SLUG_REGEX).max(64).optional(),
  /**
   * Same resolved host-agent slug as `agent`, under the dashboard's
   * canonical `agent_id` key (activation funnel join). Omitted when
   * undetected.
   */
  agent_id: external_exports.string().regex(AGENT_SLUG_REGEX).max(64).optional()
}).strict();

// ../../packages/core/src/analytics/events/migration-run-completed.ts
var MigrationRunCompletedSchema = external_exports.object({
  duration_ms: external_exports.number().int().nonnegative(),
  /** `completed` = every project migrated; `partial` = some failed; `error` = none. */
  outcome: external_exports.enum(["completed", "partial", "error"]),
  /** v3 projects discovered for this run (a folder with `.brv/context-tree/*.md`). */
  projects_total: external_exports.number().int().nonnegative(),
  /** Projects whose v4 space was created AND materialized. */
  spaces_migrated: external_exports.number().int().nonnegative(),
  /** Projects that failed (createSpace / materialize error). */
  projects_failed: external_exports.number().int().nonnegative(),
  /** Markdown topics converted to `<bv-topic>` HTML across all migrated spaces. */
  topics_converted: external_exports.number().int().nonnegative(),
  /** Topics that failed to convert. */
  topics_failed: external_exports.number().int().nonnegative(),
  task_id: external_exports.string().min(1),
  task_type: external_exports.enum(TASK_TYPE_VALUES),
  /** Team the spaces were created under. */
  team_id: external_exports.string().min(1).max(64).optional(),
  /** Host agent slug that ran the migration (e.g. `openclaw`); omitted when undetected. */
  agent: external_exports.string().regex(AGENT_SLUG_REGEX).max(64).optional(),
  /** Same slug under the dashboard's canonical `agent_id` key (activation-funnel join). */
  agent_id: external_exports.string().regex(AGENT_SLUG_REGEX).max(64).optional()
}).strict();

// ../../packages/core/src/analytics/events/migration-started.ts
var MigrationStartedSchema = external_exports.object({
  /** v3 projects discovered for this run (a folder with `.brv/context-tree/*.md`). */
  projects_total: external_exports.number().int().nonnegative(),
  /** Shared with the paired `migration_run_completed` row. */
  task_id: external_exports.string().min(1),
  task_type: external_exports.enum(TASK_TYPE_VALUES),
  /** Team the spaces are created under. */
  team_id: external_exports.string().min(1).max(64).optional(),
  /** Host agent slug that ran the migration (e.g. `openclaw`); omitted when undetected. */
  agent: external_exports.string().regex(AGENT_SLUG_REGEX).max(64).optional(),
  /** Same slug under the dashboard's canonical `agent_id` key. */
  agent_id: external_exports.string().regex(AGENT_SLUG_REGEX).max(64).optional()
}).strict();

// ../../packages/core/src/analytics/events/auth-started.ts
var AuthStartedSchema = external_exports.object({
  /** Host agent slug that initiated auth (e.g. `openclaw`); omitted when undetected. */
  agent: external_exports.string().regex(AGENT_SLUG_REGEX).max(64).optional(),
  /** Same slug under the dashboard's canonical `agent_id` key. */
  agent_id: external_exports.string().regex(AGENT_SLUG_REGEX).max(64).optional()
}).strict();

// ../../packages/core/src/analytics/events/auth-completed.ts
var AuthCompletedSchema = external_exports.object({
  /** Approval latency: device-flow start → approval, in ms. Omitted when the
   *  flow's start time can't be read, so "unknown" stays distinct from a real
   *  0 ms instead of silently collapsing to 0. */
  duration_ms: external_exports.number().int().nonnegative().optional(),
  /** Host agent slug that ran auth (e.g. `openclaw`); omitted when undetected. */
  agent: external_exports.string().regex(AGENT_SLUG_REGEX).max(64).optional(),
  /** Same slug under the dashboard's canonical `agent_id` key. */
  agent_id: external_exports.string().regex(AGENT_SLUG_REGEX).max(64).optional()
}).strict();

// ../../packages/core/src/analytics/events/index.ts
var ALL_EVENT_SCHEMAS = {
  [AnalyticsEventNames.RECORD_RUN_COMPLETED]: RecordRunCompletedSchema,
  [AnalyticsEventNames.DREAM_COMPLETED]: DreamCompletedSchema,
  [AnalyticsEventNames.QUERY_COMPLETED]: QueryCompletedSchema,
  [AnalyticsEventNames.READ_COMPLETED]: ReadCompletedSchema,
  [AnalyticsEventNames.MIGRATION_RUN_COMPLETED]: MigrationRunCompletedSchema,
  [AnalyticsEventNames.MIGRATION_STARTED]: MigrationStartedSchema,
  [AnalyticsEventNames.AUTH_STARTED]: AuthStartedSchema,
  [AnalyticsEventNames.AUTH_COMPLETED]: AuthCompletedSchema
};

// ../../packages/core/src/analytics/pending-producer.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import { join as join18 } from "node:path";

// ../../packages/core/src/analytics/identity.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { mkdir as mkdir9, open as open3, readFile as readFile14, rm as rm11, stat as stat5, writeFile as writeFile8 } from "node:fs/promises";
import { join as join16 } from "node:path";
var CONFIG_FILENAME = "config.json", CONFIG_VERSION = 1;
var MACHINE_ID_KEY = "machine_id";
function configDir() {
  return getGlobalDataDir();
}
function configPath() {
  return join16(configDir(), CONFIG_FILENAME);
}
function isNonEmptyString(value) {
  return typeof value == "string" && value.trim().length > 0;
}
function isPlainObject(value) {
  return typeof value == "object" && value !== null && !Array.isArray(value);
}
async function getOrCreateMachineId() {
  return getOrCreateConfigId(MACHINE_ID_KEY);
}
async function getOrCreateConfigId(key) {
  let existing = await readConfigId(key);
  if (existing !== void 0) return existing;
  try {
    return await withConfigLock(async () => {
      let reread = await readConfigId(key);
      if (reread !== void 0) return reread;
      let minted = randomUUID2();
      return await writeConfigId(key, minted), minted;
    });
  } catch (err) {
    if (!(err instanceof ConfigLockError)) throw err;
    let reread = await readConfigId(key);
    if (reread !== void 0) return reread;
    throw err;
  }
}
var LOCK_STALE_MS2 = 3e4, LOCK_MAX_WAIT_MS = 3e3, ConfigLockError = class extends Error {
  constructor() {
    super("could not acquire config.json lock within the deadline"), this.name = "ConfigLockError";
  }
};
function delay2(ms) {
  return new Promise((resolve11) => setTimeout(resolve11, ms));
}
async function withConfigLock(fn) {
  await mkdir9(configDir(), { recursive: !0 });
  let lockPath2 = `${configPath()}.lock`, ownerId = randomUUID2(), lock, deadline = Date.now() + LOCK_MAX_WAIT_MS;
  for (; ; ) {
    try {
      lock = await open3(lockPath2, "wx");
      break;
    } catch (err) {
      if (!isErrnoCode6(err, "EEXIST")) throw err;
    }
    try {
      let st = await stat5(lockPath2);
      if (Date.now() - st.mtimeMs > LOCK_STALE_MS2) {
        await rm11(lockPath2, { force: !0 });
        continue;
      }
    } catch {
      continue;
    }
    if (Date.now() >= deadline) throw new ConfigLockError();
    await delay2(25);
  }
  if (!lock) throw new ConfigLockError();
  await lock.writeFile(ownerId, "utf8").catch(() => {
  });
  try {
    return await fn();
  } finally {
    await lock.close().catch(() => {
    });
    let current;
    try {
      current = await readFile14(lockPath2, "utf8");
    } catch {
      current = void 0;
    }
    current === ownerId && await rm11(lockPath2, { force: !0 }).catch(() => {
    });
  }
}
async function readConfigId(key) {
  let raw;
  try {
    raw = await readFile14(configPath(), "utf8");
  } catch (err) {
    if (isErrnoCode6(err, "ENOENT")) return;
    console.warn(
      `[byterover] Could not read ${configPath()}: ${describeErr3(err)}`
    );
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(
      `[byterover] ${configPath()} is malformed JSON; treating as missing`
    );
    return;
  }
  if (!isPlainObject(parsed)) {
    console.warn(
      `[byterover] ${configPath()} is not a JSON object; treating as missing`
    );
    return;
  }
  let value = parsed[key];
  return isNonEmptyString(value) ? value : void 0;
}
async function writeConfigId(key, value) {
  await mkdir9(configDir(), { recursive: !0 });
  let document = {};
  try {
    let raw = await readFile14(configPath(), "utf8"), parsed = JSON.parse(raw);
    isPlainObject(parsed) && (document = parsed);
  } catch {
  }
  let next = {
    ...document,
    [key]: value
  };
  isNonEmptyString(next.createdAt) || (next.createdAt = (/* @__PURE__ */ new Date()).toISOString()), typeof next.version != "number" && typeof next.version != "string" && (next.version = CONFIG_VERSION);
  let serialized = JSON.stringify(next, null, 2) + `
`, target = configPath(), tmp = `${target}.${randomUUID2()}.tmp`;
  try {
    await writeFile8(tmp, serialized, "utf8"), await renameWithRetry(tmp, target);
  } catch (err) {
    throw await rm11(tmp, { force: !0 }).catch(() => {
    }), err;
  }
}
function isErrnoCode6(err, code) {
  return typeof err == "object" && err !== null && "code" in err && err.code === code;
}
function describeErr3(err) {
  return err instanceof Error ? err.message : String(err);
}

// ../../packages/core/src/analytics/bounded-append.ts
import { appendFile, mkdir as mkdir10, readFile as readFile15, rm as rm12, stat as stat6, writeFile as writeFile9 } from "node:fs/promises";
import { dirname as dirname8 } from "node:path";
var MAX_ANALYTICS_BYTES = 50 * 1024 * 1024, COMPACT_TARGET_RATIO = 0.5, compactionChains = /* @__PURE__ */ new Map();
function serializeCompaction(path2, run) {
  let result = (compactionChains.get(path2) ?? Promise.resolve()).then(run, run), tail = result.then(
    () => {
    },
    () => {
    }
  );
  return compactionChains.set(path2, tail), tail.then(() => {
    compactionChains.get(path2) === tail && compactionChains.delete(path2);
  }), result;
}
async function boundedAppendLine(path2, jsonLine, opts) {
  let maxBytes2 = opts?.maxBytes ?? MAX_ANALYTICS_BYTES, line = jsonLine.endsWith(`
`) ? jsonLine : jsonLine + `
`, lineBytes = Buffer.byteLength(line, "utf8");
  try {
    await mkdir10(dirname8(path2), { recursive: !0 });
    let dropped = 0, currentSize = 0;
    try {
      currentSize = (await stat6(path2)).size;
    } catch {
      currentSize = 0;
    }
    if (currentSize + lineBytes > maxBytes2) {
      let target = Math.min(
        maxBytes2 - lineBytes,
        Math.floor(maxBytes2 * COMPACT_TARGET_RATIO)
      );
      dropped = await serializeCompaction(
        path2,
        () => compactToFit(path2, Math.max(0, target))
      );
    }
    return await appendFile(path2, line, "utf8"), dropped;
  } catch {
    return 0;
  }
}
async function compactToFit(path2, budgetBytes) {
  let raw;
  try {
    raw = await readFile15(path2, "utf8");
  } catch {
    return 0;
  }
  let lines = raw.split(`
`).filter((l) => l.length > 0);
  if (lines.length === 0) return 0;
  let keptReversed = [], used = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    let l = lines[i], b = Buffer.byteLength(l + `
`, "utf8");
    if (used + b > budgetBytes) break;
    used += b, keptReversed.push(l);
  }
  let kept = keptReversed.reverse(), dropped = lines.length - kept.length;
  if (dropped === 0) return 0;
  let body = kept.length > 0 ? kept.map((l) => l + `
`).join("") : "", tmp = `${path2}.${process.pid}.compact.tmp`;
  try {
    await writeFile9(tmp, body, "utf8"), await renameWithRetry(tmp, path2);
  } catch {
    return await rm12(tmp, { force: !0 }).catch(() => {
    }), 0;
  }
  return dropped;
}

// ../../packages/core/src/analytics/shared-state.ts
import { mkdir as mkdir11, readFile as readFile16, rm as rm13, writeFile as writeFile10 } from "node:fs/promises";
import { dirname as dirname9, join as join17 } from "node:path";
var IDENTITY_CURRENT_FILE = "analytics-identity-current.json";
function identityCurrentPath() {
  return join17(getGlobalDataDir(), IDENTITY_CURRENT_FILE);
}
function isRecord(value) {
  return typeof value == "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString2(value) {
  return typeof value == "string" && value.trim().length > 0;
}
async function readIdentityCurrent(path2 = identityCurrentPath()) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile16(path2, "utf8"));
  } catch {
    return;
  }
  if (isRecord(parsed) && parsed.schemaVersion === 1 && parsed.source === "desktop_web_sdk" && isNonEmptyString2(parsed.activeDeviceId))
    return {
      activeDeviceId: parsed.activeDeviceId,
      source: "desktop_web_sdk",
      ...isNonEmptyString2(parsed.userId) ? { userId: parsed.userId } : {},
      ...isNonEmptyString2(parsed.deviceIdPublishedAt) ? { deviceIdPublishedAt: parsed.deviceIdPublishedAt } : {},
      ...isNonEmptyString2(parsed.desktopHeartbeatAt) ? { desktopHeartbeatAt: parsed.desktopHeartbeatAt } : {}
    };
}
var SHARED_STATE_SCHEMA_VERSION = 1;
var DAEMON_IDENTITY_FILE = "analytics-daemon-identity.json";
function daemonIdentityPath() {
  return join17(getGlobalDataDir(), DAEMON_IDENTITY_FILE);
}
async function readDaemonIdentity(path2 = daemonIdentityPath()) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile16(path2, "utf8"));
  } catch {
    return;
  }
  if (isRecord(parsed) && parsed.schemaVersion === SHARED_STATE_SCHEMA_VERSION && isNonEmptyString2(parsed.userId))
    return {
      userId: parsed.userId,
      ...isNonEmptyString2(parsed.publishedAt) ? { publishedAt: parsed.publishedAt } : {}
    };
}

// ../../packages/core/src/analytics/two-stage-schema.ts
var nonEmpty = (msg) => external_exports.string().refine((s) => s.trim().length > 0, { message: msg }), DeviceIdSourceSchema = external_exports.enum([
  "desktop_web_sdk",
  "daemon_runtime"
]), AuthContextTypeSchema = external_exports.enum(["jwt", "api_key"]), AuthContextSchema = external_exports.object({
  type: AuthContextTypeSchema,
  source: external_exports.string().optional(),
  auth_state_updated_at: external_exports.string().optional()
}).strict(), ObservedIdentitySchema = external_exports.object({
  device_id: external_exports.string().optional(),
  device_id_source: DeviceIdSourceSchema.optional(),
  user_id: external_exports.string().optional(),
  auth_context: AuthContextSchema.optional()
}).strict(), ObservedAuthStateSchema = external_exports.object({
  status: external_exports.enum(["authenticated", "unauthenticated"]),
  updated_at: external_exports.string().optional(),
  source: external_exports.string().optional()
}).strict(), PendingPropertiesSchema = external_exports.object({
  machine_id: nonEmpty("machine_id must be non-empty"),
  source: nonEmpty("source must be non-empty")
}).passthrough(), PendingRowSchema = external_exports.object({
  id: external_exports.string().min(1),
  name: external_exports.string().min(1),
  occurred_at: external_exports.string().datetime({ offset: !0 }),
  observed_identity: ObservedIdentitySchema.optional(),
  observed_auth_state: ObservedAuthStateSchema.optional(),
  properties: PendingPropertiesSchema
}).strict(), QueueIdentitySchema = external_exports.object({
  device_id: nonEmpty("identity.device_id must be non-empty"),
  device_id_source: DeviceIdSourceSchema,
  user_id: external_exports.string().optional(),
  auth_context: AuthContextSchema.optional()
}).strict(), QueuePropertiesSchema = external_exports.object({
  machine_id: nonEmpty("properties.machine_id must be non-empty"),
  source: nonEmpty("properties.source must be non-empty"),
  identity_fallback: external_exports.boolean(),
  identity_fallback_reason: external_exports.string().optional(),
  runtime_identity_source: DeviceIdSourceSchema,
  auth_source: external_exports.string().optional()
}).passthrough(), QueueRowSchema = external_exports.object({
  id: external_exports.string().min(1),
  name: external_exports.string().min(1),
  created_at: external_exports.string().datetime({ offset: !0 }),
  timestamp: external_exports.string().datetime({ offset: !0 }),
  status: external_exports.literal("pending"),
  attempts: external_exports.number().int().min(0),
  identity: QueueIdentitySchema,
  properties: QueuePropertiesSchema
}).strict().superRefine((row, ctx) => {
  row.identity.user_id !== void 0 && row.identity.auth_context === void 0 && ctx.addIssue({
    code: external_exports.ZodIssueCode.custom,
    message: "identity.auth_context is required when identity.user_id is present",
    path: ["identity", "auth_context"]
  }), row.properties.identity_fallback === !0 && row.properties.identity_fallback_reason === void 0 && ctx.addIssue({
    code: external_exports.ZodIssueCode.custom,
    message: "properties.identity_fallback_reason is required when identity_fallback=true",
    path: ["properties", "identity_fallback_reason"]
  });
});

// ../../packages/core/src/analytics/pending-producer.ts
var PENDING_FILENAME = "analytics-pending-identity.jsonl";
function pendingFilePath() {
  return join18(getGlobalDataDir(), PENDING_FILENAME);
}
async function captureAnalyticsEvent(input) {
  try {
    let occurredAt = (input.occurredAt ?? /* @__PURE__ */ new Date()).toISOString(), machineId = await getOrCreateMachineId(), current = await (input.readCurrentIdentity ?? (async () => {
      let cur = await readIdentityCurrent();
      return cur ? {
        activeDeviceId: cur.activeDeviceId,
        ...cur.userId !== void 0 ? { userId: cur.userId } : {},
        ...cur.deviceIdPublishedAt !== void 0 ? { publishedAt: cur.deviceIdPublishedAt } : {}
      } : void 0;
    }))(), daemonId = await (input.readDaemonIdentity ?? (() => readDaemonIdentity()))(), auth = input.auth, isAuthed = auth?.status === "authenticated" && auth.userId !== void 0, isExplicitlyUnauthed = auth?.status === "unauthenticated", observedIdentity, observedAuthState;
    if (isExplicitlyUnauthed)
      observedAuthState = {
        status: "unauthenticated",
        ...auth?.updatedAt !== void 0 ? { updated_at: auth.updatedAt } : {},
        ...auth?.source !== void 0 ? { source: auth.source } : {}
      };
    else {
      let devicePart = current !== void 0 ? {
        device_id: current.activeDeviceId,
        device_id_source: "desktop_web_sdk"
      } : {}, authPart = {};
      isAuthed ? authPart = {
        user_id: auth.userId,
        ...auth.authContext !== void 0 ? { auth_context: auth.authContext } : {}
      } : current?.userId !== void 0 ? authPart = {
        user_id: current.userId,
        auth_context: {
          type: "jwt",
          source: "desktop_auth",
          ...current.publishedAt !== void 0 ? { auth_state_updated_at: current.publishedAt } : {}
        }
      } : daemonId?.userId !== void 0 && (authPart = {
        user_id: daemonId.userId,
        auth_context: { type: "jwt", source: "daemon_auth" }
      });
      let merged = { ...devicePart, ...authPart };
      Object.keys(merged).length > 0 && (observedIdentity = merged);
    }
    let properties = {
      ...input.properties ?? {},
      machine_id: machineId,
      source: input.source
    }, row = {
      id: randomUUID3(),
      name: input.name,
      occurred_at: occurredAt,
      ...observedIdentity !== void 0 ? { observed_identity: observedIdentity } : {},
      ...observedAuthState !== void 0 ? { observed_auth_state: observedAuthState } : {},
      properties
    };
    return PendingRowSchema.parse(row), await boundedAppendLine(pendingFilePath(), JSON.stringify(row), input.bounds), row;
  } catch (err) {
    console.warn(
      `[analytics] dropped pending ${String(input.name)}: ${describeErr4(err)}`
    );
    return;
  }
}
function describeErr4(err) {
  return err instanceof Error ? err.message : String(err);
}

// ../../packages/core/src/analytics/append.ts
var EVENT_NAME_PREFIX = "v4:", SKILL_EVENT_RESOURCE = "skill";
function toFinalSkillEventName(rawName) {
  return rawName.startsWith(EVENT_NAME_PREFIX) ? rawName : `${EVENT_NAME_PREFIX}${SKILL_EVENT_RESOURCE}:${rawName}`;
}
async function appendAnalyticsRecord(input) {
  try {
    let validatedProps = ALL_EVENT_SCHEMAS[input.name].parse(input.properties);
    await captureAnalyticsEvent({
      name: toFinalSkillEventName(input.name),
      source: input.source ?? "skill",
      properties: validatedProps
    });
  } catch (err) {
    console.warn(
      `[analytics] dropped ${String(input.name)}: ${describeErr5(err)}`
    );
  }
}
function describeErr5(err) {
  return err instanceof Error ? err.message : String(err);
}

// ../../packages/core/src/analytics/daemon-events.ts
var DAEMON_EVENT_ACTION = {
  started: "started",
  syncStarted: "sync_started",
  syncReady: "sync_ready",
  syncFailed: "sync_failed"
}, DAEMON_EVENT_ACTIONS = [
  DAEMON_EVENT_ACTION.started,
  DAEMON_EVENT_ACTION.syncStarted,
  DAEMON_EVENT_ACTION.syncReady,
  DAEMON_EVENT_ACTION.syncFailed
], DAEMON_OUTCOME = {
  success: "success",
  error: "error"
}, DAEMON_PROVIDER_KIND = {
  none: "none",
  apiKey: "api_key",
  desktop: "desktop"
}, DaemonLifecycleSchema = external_exports.object({
  /**
   * Which auth provider the daemon resolved. `none` = no provider (analytics
   * ships anonymously), `api_key` = a BRV API key, `desktop` = a
   * desktop-synced daemon device session.
   */
  provider_kind: external_exports.enum([
    DAEMON_PROVIDER_KIND.none,
    DAEMON_PROVIDER_KIND.apiKey,
    DAEMON_PROVIDER_KIND.desktop
  ]),
  /** Whether the analytics shipper loop is enabled (a telemetry URL is set). */
  analytics_enabled: external_exports.boolean(),
  /** Whether file-sync is configured/running (an auth provider exists). */
  file_sync_enabled: external_exports.boolean(),
  /** The daemon build version (the `DAEMON_VERSION` constant). */
  daemon_version: external_exports.string().min(1),
  /** Coarse outcome for action/health events. */
  outcome: external_exports.enum([DAEMON_OUTCOME.success, DAEMON_OUTCOME.error]).optional(),
  /** Stable, bounded, non-PII failure code. NEVER a message with a path/URL. */
  error_code: external_exports.string().max(120).optional()
}).strict();

// src/agent-resolver.ts
function resolveAgent(env = process.env) {
  let explicit = env.BRV_AGENT;
  if (typeof explicit == "string" && explicit.length > 0 && AGENT_SLUG_REGEX.test(explicit))
    return explicit;
  for (let { slug, isSet } of HOST_FINGERPRINTS)
    if (isSet(env)) return slug;
}
var HOST_FINGERPRINTS = [
  {
    isSet: (env) => env.CLAUDECODE === "1" || typeof env.CLAUDE_CODE_ENTRYPOINT == "string",
    slug: "claude"
  },
  {
    isSet: (env) => typeof env.CODEX_SANDBOX == "string" || typeof env.CODEX_SANDBOX_NETWORK_DISABLED == "string",
    slug: "codex"
  },
  { isSet: (env) => env.CURSOR_AGENT === "1", slug: "cursor" },
  { isSet: (env) => env.GEMINI_CLI === "1", slug: "gemini" }
];

// ../../packages/signing/src/errors.ts
var KeyError = class extends Error {
  constructor(message) {
    super(message), this.name = "KeyError";
  }
}, DecryptError = class extends Error {
  constructor(message) {
    super(message), this.name = "DecryptError";
  }
}, KeyStoreError = class extends Error {
  constructor(message) {
    super(message), this.name = "KeyStoreError";
  }
};

// ../../packages/signing/src/keys.ts
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync
} from "node:crypto";
function assertEd25519(publicKeyPem) {
  if (/PRIVATE KEY/.test(publicKeyPem))
    throw new KeyError("expected a public key, got a private key");
  let key;
  try {
    key = createPublicKey(publicKeyPem);
  } catch (e) {
    throw new KeyError(`not a valid public key: ${e.message}`);
  }
  if (key.asymmetricKeyType !== "ed25519")
    throw new KeyError(
      `expected an ed25519 key, got ${String(key.asymmetricKeyType)}`
    );
  return key;
}
function generateTreeKeyPair() {
  let { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" })
  };
}

// ../../packages/signing/src/sign.ts
import {
  createPrivateKey as createPrivateKey2,
  createPublicKey as createPublicKey2,
  sign as nodeSign,
  verify as nodeVerify
} from "node:crypto";
var ED25519_SIGNATURE_BYTES = 64;
function ed25519PrivateKey(privateKeyPem) {
  let key;
  try {
    key = createPrivateKey2(privateKeyPem);
  } catch (e) {
    throw new KeyError(`not a valid private key: ${e.message}`);
  }
  if (key.asymmetricKeyType !== "ed25519")
    throw new KeyError(
      `expected an ed25519 private key, got ${String(key.asymmetricKeyType)}`
    );
  return key;
}
function decodeEd25519Signature(signature) {
  if (!/^[A-Za-z0-9_-]+$/.test(signature))
    throw new Error("signature is not base64url");
  let buf = Buffer.from(signature, "base64url");
  if (buf.length !== ED25519_SIGNATURE_BYTES)
    throw new Error(
      `expected a ${ED25519_SIGNATURE_BYTES}-byte signature, got ${buf.length}`
    );
  return buf;
}
function signDetached(privateKeyPem, message) {
  let key = ed25519PrivateKey(privateKeyPem);
  return nodeSign(null, Buffer.from(message), key).toString("base64url");
}
function verifyDetached(publicKeyPem, message, signature) {
  try {
    let sig = decodeEd25519Signature(signature), key = createPublicKey2(publicKeyPem);
    return key.asymmetricKeyType !== "ed25519" ? !1 : nodeVerify(null, Buffer.from(message), key, sig);
  } catch {
    return !1;
  }
}

// ../../packages/signing/src/topic-signature.ts
var TOPIC_SIGNATURE_PREFIX = "byterover.topic-signature.v1", CANONICAL_HASH = /^[0-9a-f]{64}$/;
function topicSignatureMessage(canonicalHashHex) {
  if (!CANONICAL_HASH.test(canonicalHashHex))
    throw new Error(
      "canonicalHashHex must be exactly 64 lowercase hex characters"
    );
  return new TextEncoder().encode(
    `${TOPIC_SIGNATURE_PREFIX}
sha256-hex:${canonicalHashHex}`
  );
}
function signTopicHash(privateKeyPem, canonicalHashHex) {
  return signDetached(privateKeyPem, topicSignatureMessage(canonicalHashHex));
}
function verifyTopicHash(publicKeyPem, canonicalHashHex, signature) {
  let message;
  try {
    message = topicSignatureMessage(canonicalHashHex);
  } catch {
    return !1;
  }
  return verifyDetached(publicKeyPem, message, signature);
}

// ../../packages/signing/src/fingerprint.ts
import { createHash as createHash4 } from "node:crypto";
function fingerprint(publicKeyPem) {
  let der = assertEd25519(publicKeyPem).export({ type: "spki", format: "der" });
  return createHash4("sha256").update(der).digest("base64url");
}

// ../../packages/signing/src/jwk.ts
import { createHash as createHash5 } from "node:crypto";
function exportPublicJwk(publicKeyPem) {
  let { kty, crv, x } = assertEd25519(publicKeyPem).export({ format: "jwk" });
  return { kty: String(kty), crv: String(crv), x: String(x) };
}
function jwkThumbprint(publicKeyPem) {
  let jwk = exportPublicJwk(publicKeyPem), canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x });
  return createHash5("sha256").update(canonical).digest("base64url");
}

// ../../packages/signing/src/encrypted-key-store.ts
import {
  createCipheriv,
  createDecipheriv,
  randomBytes as randomBytes5,
  scrypt
} from "node:crypto";
import { mkdir as mkdir12, readFile as readFile17, rename as rename7, stat as stat7, unlink, writeFile as writeFile11 } from "node:fs/promises";
import { isAbsolute as isAbsolute2, join as join19, resolve as resolve9, sep as sep6 } from "node:path";
var KDF_PARAMS = {
  N: 32768,
  // 2^15
  r: 8,
  p: 1,
  // 128*N*r ~= 33.5MB exceeds node's default 32MiB maxmem and would throw — set explicitly.
  maxmem: 64 * 1024 * 1024,
  keylen: 32
  // AES-256
}, SALT_BYTES = 16, IV_BYTES = 12, RECORD_VERSION = 1, ALG = "AES-256-GCM", KDF = "scrypt";
function aad(meta) {
  return Buffer.from(
    JSON.stringify({
      v: meta.v,
      alg: meta.alg,
      kdf: meta.kdf,
      kdfParams: {
        N: meta.kdfParams.N,
        r: meta.kdfParams.r,
        p: meta.kdfParams.p,
        maxmem: meta.kdfParams.maxmem,
        keylen: meta.kdfParams.keylen
      },
      salt: meta.salt,
      iv: meta.iv,
      id: meta.id
    }),
    "utf8"
  );
}
function deriveKey(passphrase, salt) {
  return new Promise((res, rej) => {
    scrypt(
      passphrase,
      salt,
      KDF_PARAMS.keylen,
      {
        N: KDF_PARAMS.N,
        r: KDF_PARAMS.r,
        p: KDF_PARAMS.p,
        maxmem: KDF_PARAMS.maxmem
      },
      (err, derivedKey) => {
        err ? rej(err) : res(derivedKey);
      }
    );
  });
}
var FileEncryptedKeyStore = class {
  constructor(root) {
    this.root = root;
  }
  /** Validate `id` and resolve its record path, refusing anything outside root. */
  pathFor(id) {
    if (!/^[A-Za-z0-9._-]+$/.test(id) || id === "." || id === "..")
      throw new KeyStoreError(`invalid key id: ${JSON.stringify(id)}`);
    let root = resolve9(this.root), path2 = resolve9(join19(root, `${id}.json`));
    if (path2 !== join19(root, `${id}.json`) || !path2.startsWith(root + sep6))
      throw new KeyStoreError(`key id escapes the store root: ${id}`);
    if (isAbsolute2(id)) throw new KeyStoreError(`invalid key id: ${id}`);
    return path2;
  }
  async save(id, privateKeyPem, passphrase) {
    let path2 = this.pathFor(id), salt = randomBytes5(SALT_BYTES), iv = randomBytes5(IV_BYTES), meta = {
      v: RECORD_VERSION,
      alg: ALG,
      kdf: KDF,
      kdfParams: KDF_PARAMS,
      salt: salt.toString("base64url"),
      iv: iv.toString("base64url"),
      id
    }, key = await deriveKey(passphrase, salt);
    try {
      let cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(aad(meta));
      let ciphertext = Buffer.concat([
        cipher.update(Buffer.from(privateKeyPem, "utf8")),
        cipher.final()
      ]), record = {
        ...meta,
        ciphertext: ciphertext.toString("base64url"),
        tag: cipher.getAuthTag().toString("base64url")
      };
      await mkdir12(this.root, { recursive: !0, mode: 448 });
      let tmp = `${path2}.tmp-${randomBytes5(6).toString("hex")}`;
      await writeFile11(tmp, JSON.stringify(record), { mode: 384 }), await rename7(tmp, path2);
    } finally {
      key.fill(0);
    }
  }
  async load(id, passphrase) {
    let path2 = this.pathFor(id), raw;
    try {
      raw = await readFile17(path2, "utf8");
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw new KeyStoreError(`cannot read key ${id}: ${e.message}`);
    }
    let record;
    try {
      if (record = JSON.parse(raw), record.v !== RECORD_VERSION || record.alg !== ALG || record.kdf !== KDF || typeof record.salt != "string" || typeof record.iv != "string" || typeof record.ciphertext != "string" || typeof record.tag != "string")
        throw new Error("unexpected record shape");
    } catch (e) {
      throw new KeyStoreError(`malformed key record ${id}: ${e.message}`);
    }
    if (record.id !== id)
      throw new DecryptError(`key id mismatch for ${id} (possible record swap)`);
    let { ciphertext, tag, ...meta } = record, key = await deriveKey(passphrase, Buffer.from(record.salt, "base64url"));
    try {
      let decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(record.iv, "base64url")
      );
      return decipher.setAAD(aad({ ...meta, id })), decipher.setAuthTag(Buffer.from(tag, "base64url")), Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final()
        // throws on auth failure (wrong passphrase or tamper)
      ]).toString("utf8");
    } catch (e) {
      throw new DecryptError(
        `cannot decrypt key ${id} (wrong passphrase or tampered record): ${e.message}`
      );
    } finally {
      key.fill(0);
    }
  }
  async has(id) {
    try {
      return await stat7(this.pathFor(id)), !0;
    } catch {
      return !1;
    }
  }
  async delete(id) {
    try {
      await unlink(this.pathFor(id));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
};

// ../../packages/sync/src/http-client.ts
var import_realtime_contracts = __toESM(require_realtime_contracts());
import { randomUUID as randomUUID4 } from "node:crypto";
var RateLimitedError = class extends Error {
  constructor(retryAfterMs, status) {
    super(`rate limited (${status})`);
    this.retryAfterMs = retryAfterMs;
    this.status = status;
    this.name = "RateLimitedError";
  }
}, RejectedError = class extends Error {
  constructor(reason, status) {
    super(`rejected:${reason} (${status})`);
    this.reason = reason;
    this.status = status;
  }
}, AuthError = class extends Error {
  /**
   * `reason` carries the backend's `WWW-Authenticate` detail (e.g.
   * `invalid_token`, `error_description="signature verification failed"`) when
   * present. A 401 with a VALID, unexpired capability token is not expiry — it's
   * usually a signing-key / issuer / audience mismatch between the token minter
   * and the data-plane backend, or clock skew. Surfacing the reason turns an
   * opaque `auth:401` into an actionable diagnosis in the daemon log.
   */
  constructor(status, reason) {
    super(`auth:${status}${reason ? ` (${reason})` : ""}`);
    this.status = status;
    this.reason = reason;
  }
}, BundleUnsupportedError = class extends Error {
  constructor(status) {
    super(`bundle endpoint unsupported (http ${status})`);
    this.status = status;
    this.name = "BundleUnsupportedError";
  }
}, CONTENT_TYPE = {
  html: "text/html",
  md: "text/markdown"
};
function contentTypeFor(key) {
  let ext = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  return CONTENT_TYPE[ext] ?? "application/octet-stream";
}
function classify(status) {
  return status === 401 ? "auth" : status === 415 ? "content-type" : status === 413 ? "too-large" : status === 400 ? "invalid-key" : status === 403 ? "forbidden" : null;
}
var sleep2 = (ms) => new Promise((r) => setTimeout(r, ms)), backoffMs = (attempt) => Math.min(1e3, 100 * 2 ** attempt);
function parseRetryAfter(res) {
  let h = res.headers.get("retry-after");
  if (!h) return;
  let secs = Number(h);
  return Number.isFinite(secs) ? secs * 1e3 : void 0;
}
var MemoryHttpClient = class {
  constructor(cfg, getToken = () => cfg.token) {
    this.cfg = cfg;
    this.getToken = getToken;
  }
  getToken;
  base() {
    return `${this.cfg.baseUrl}/v1/memory/${this.cfg.teamId}/${this.cfg.spaceId}`;
  }
  headers(extra) {
    return { authorization: `Bearer ${this.getToken()}`, ...extra };
  }
  /** Keep `/` separators in keys; encode each segment. */
  fileUrl(key) {
    let safe = key.split("/").map(encodeURIComponent).join("/");
    return `${this.base()}/files/${safe}`;
  }
  folderUrl(folderPath) {
    let safe = folderPath.split("/").map(encodeURIComponent).join("/");
    return `${this.base()}/folders/${safe}`;
  }
  requestHeaders(initHeaders) {
    let headers = {};
    return new Headers(initHeaders).forEach((value, key) => {
      headers[key] = value;
    }), headers;
  }
  logHttpFailure(input) {
    try {
      let parsed = new URL(input.url), method = input.init.method ?? "GET", err = input.error, UUID_RE2 = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, sanitizedUrlPath = `${parsed.pathname}${parsed.search}`.replace(/\/bsh_[A-Za-z0-9_-]+/g, "/[handle]").replace(UUID_RE2, "[id]");
      Promise.resolve(
        this.cfg.log?.({
          component: "sync-engine",
          action: "http.failure",
          method,
          urlPath: sanitizedUrlPath,
          host: parsed.host,
          status: input.response?.status,
          statusText: input.response?.statusText,
          requestId: input.requestId,
          cfRay: input.response?.headers.get("cf-ray") ?? void 0,
          attempt: input.attempt,
          nextRetryMs: input.nextRetryMs,
          maxRetries: input.maxRetries,
          errorName: err instanceof Error ? err.name : void 0,
          error: err instanceof Error ? err.message : err ? String(err) : void 0
        })
      ).catch(() => {
      });
    } catch {
    }
  }
  async guard(res) {
    if (res.ok) return res;
    let c = classify(res.status);
    if (c === "auth") {
      let header = res.headers.get("www-authenticate"), reason = header ? header.slice(0, 200) : void 0;
      throw new AuthError(res.status, reason);
    }
    throw c ? new RejectedError(c, res.status) : new Error(`http ${res.status} ${res.statusText}`);
  }
  /**
   * fetch with a hard timeout + bounded retry. WITHOUT this, a single stalled
   * request hangs the (serial) reconcile loop indefinitely — the root cause of
   * "sync never completes" at scale. A timeout already waited the full window,
   * so a dead endpoint is NOT retried (retrying just multiplies the stall);
   * transient network errors and 5xx ARE retried with backoff.
   */
  async send(url, init, opts) {
    let timeoutMs = this.cfg.requestTimeoutMs ?? 3e4, maxRetries = this.cfg.maxRetries ?? 2, requestId = randomUUID4();
    for (let attempt = 0; ; attempt++) {
      let requestInit = {
        ...init,
        headers: {
          ...this.requestHeaders(init.headers),
          "x-request-id": requestId
        }
      };
      try {
        let res = await fetch(url, {
          ...requestInit,
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (opts?.policy === "poll" && (res.status === 429 || res.status === 503)) {
          let retryAfterMs = parseRetryAfter(res);
          if (res.status === 429 || retryAfterMs !== void 0)
            throw new RateLimitedError(retryAfterMs, res.status);
        }
        if (res.status >= 500 && attempt < maxRetries) {
          let nextRetryMs = backoffMs(attempt);
          this.logHttpFailure({
            url,
            init,
            requestId,
            attempt,
            maxRetries,
            nextRetryMs,
            response: res
          }), await sleep2(nextRetryMs);
          continue;
        }
        return res.ok || this.logHttpFailure({
          url,
          init,
          requestId,
          attempt,
          maxRetries,
          response: res
        }), res;
      } catch (err) {
        if (err instanceof RateLimitedError) throw err;
        if (err instanceof Error && err.name === "TimeoutError" || attempt >= maxRetries)
          throw this.logHttpFailure({
            url,
            init,
            requestId,
            attempt,
            maxRetries,
            error: err
          }), err;
        let nextRetryMs = backoffMs(attempt);
        this.logHttpFailure({
          url,
          init,
          requestId,
          attempt,
          maxRetries,
          nextRetryMs,
          error: err
        }), await sleep2(nextRetryMs);
      }
    }
  }
  async getManifest() {
    let data = await (await this.guard(
      await this.send(
        `${this.base()}/manifest`,
        { headers: this.headers() },
        { policy: "poll" }
      )
    )).json();
    return Array.isArray(data) ? data : data.files ?? [];
  }
  async getBootstrap() {
    let data = await (await this.guard(
      await this.send(`${this.base()}/bootstrap`, { headers: this.headers() })
    )).json();
    if (!(0, import_realtime_contracts.isBootstrapResponse)(data))
      throw new Error("invalid bootstrap response");
    return data;
  }
  async getChanges(afterRev, toRev) {
    let toRevParam = toRev !== void 0 ? `&toRev=${toRev}` : "", data = await (await this.guard(
      await this.send(
        `${this.base()}/changes?afterRev=${afterRev}${toRevParam}`,
        {
          headers: this.headers()
        },
        { policy: "poll" }
      )
    )).json();
    if (!(0, import_realtime_contracts.isChangesResponse)(data)) throw new Error("invalid changes response");
    return data;
  }
  /**
   * Like getManifest() but also returns the manifest's current revision (B6).
   * Used to RE-SEED the delta cursor after a fallback/gap so the engine doesn't
   * loop manifest↔changes forever. Tolerates a bare array or a missing `rev`
   * (older/fake servers) → `rev: null`.
   */
  async getManifestWithRev() {
    let data = await (await this.guard(
      await this.send(
        `${this.base()}/manifest`,
        { headers: this.headers() },
        { policy: "poll" }
      )
    )).json();
    if (Array.isArray(data)) return { files: data, rev: null };
    let rev = typeof data.rev == "number" ? data.rev : null;
    return { files: data.files ?? [], rev };
  }
  async getBootstrapBundle(handle) {
    let safe = encodeURIComponent(handle), res = await this.guard(
      await this.send(`${this.base()}/bootstrap/${safe}/bundle`, {
        headers: this.headers()
      })
    );
    if (!res.body) throw new Error("missing bootstrap bundle body");
    return res.body;
  }
  async getFile(key) {
    return (await this.guard(
      await this.send(this.fileUrl(key), { headers: this.headers() })
    )).text();
  }
  async putFile(key, body) {
    return await (await this.guard(
      await this.send(this.fileUrl(key), {
        method: "PUT",
        headers: this.headers({ "content-type": contentTypeFor(key) }),
        body
      })
    )).json();
  }
  async deleteFile(key) {
    await this.guard(
      await this.send(this.fileUrl(key), {
        method: "DELETE",
        headers: this.headers()
      })
    );
  }
  async deleteFolder(folderPath) {
    return await (await this.guard(
      await this.send(this.folderUrl(folderPath), {
        method: "DELETE",
        headers: this.headers()
      })
    )).json();
  }
  /**
   * Provision the space trust anchor: PUT the Ed25519 PUBLIC key PEM so the
   * backend can verify topics and serve the redacted/metadata layers. Returns a
   * STATUS rather than throwing on the expected non-2xx outcomes, so callers can
   * distinguish "already pinned to a DIFFERENT key" (`conflict`) from a benign
   * skip — the former means this space's signing identity has DIVERGED from the
   * pinned anchor and its redacted layer is now dark. (Network errors still
   * reject; `provisionTrustAnchor` maps those to `unreachable`.)
   */
  async putIdentity(publicKeyPem, opts = {}) {
    let url = `${this.base()}/identity${opts.rotate ? "?rotate=1" : ""}`, res = await this.send(url, {
      method: "PUT",
      headers: this.headers({ "content-type": "application/octet-stream" }),
      body: publicKeyPem
    });
    if (res.ok) {
      let data = await res.json().catch(() => null);
      return data?.status === "unchanged" ? "unchanged" : data?.status === "rotated" ? "rotated" : "created";
    }
    return res.status === 409 ? "conflict" : "rejected";
  }
  /**
   * Push the space's SIGNED topic-index (id↔path) so the backend can resolve
   * per-topic disclosure grants. Unlike the trust anchor this is rotatable —
   * it's overwritten on every rebuild; the backend re-verifies the embedded
   * signature against the pinned trust anchor before accepting. Best-effort:
   * returns "ok" | "rejected" (the caller never blocks a sync on it).
   */
  async putTopicIndex(signedJson) {
    return (await this.send(`${this.base()}/topic-index`, {
      method: "PUT",
      headers: this.headers({ "content-type": "application/octet-stream" }),
      body: signedJson
    })).ok ? "ok" : "rejected";
  }
  /**
   * Upload a gzip-compressed file bundle to the server.
   *
   * Bypasses `send()` because:
   * 1. `send()` overwrites `x-request-id` with a random UUID — the bundle
   *    needs a STABLE client-provided id as the idempotency key.
   * 2. `guard()` throws before status can be read — we need to branch on
   *    404/501/415 for `BundleUnsupportedError` without falling into the
   *    generic error path.
   *
   * The buffered `Uint8Array` body is safely re-sendable on retry.
   * Size-proportional timeout prevents stalls on large bundles over slow uplinks.
   */
  async putFileBundle(body, requestId, onThrottle) {
    let url = `${this.base()}/bundle`, maxRetries = this.cfg.maxRetries ?? 2, init = { method: "POST" }, timeoutMs = Math.max(
      this.cfg.requestTimeoutMs ?? 3e4,
      Math.ceil(body.byteLength / 64)
    );
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: this.headers({
            "content-type": "application/gzip",
            "x-request-id": requestId
          }),
          body,
          // Uint8Array is a valid fetch body at runtime; cast bridges the node-lib vs DOM-lib BodyInit variance under TS 5.7
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch (err) {
        if (err instanceof Error && err.name === "TimeoutError" || attempt >= maxRetries)
          throw this.logHttpFailure({ url, init, requestId, attempt, maxRetries, error: err }), err;
        let nextRetryMs = backoffMs(attempt);
        this.logHttpFailure({
          url,
          init,
          requestId,
          attempt,
          maxRetries,
          nextRetryMs,
          error: err
        }), await sleep2(nextRetryMs);
        continue;
      }
      if (res.status === 404 || res.status === 501 || res.status === 415)
        throw new BundleUnsupportedError(res.status);
      let retryAfterMs = parseRetryAfter(res);
      if ((res.status === 429 || res.status === 503 && retryAfterMs !== void 0) && attempt < maxRetries) {
        onThrottle?.();
        let nextRetryMs = retryAfterMs ?? backoffMs(attempt);
        this.logHttpFailure({
          url,
          init,
          requestId,
          attempt,
          maxRetries,
          nextRetryMs,
          response: res
        }), await sleep2(nextRetryMs);
        continue;
      }
      if (res.status >= 500 && attempt < maxRetries) {
        let nextRetryMs = backoffMs(attempt);
        this.logHttpFailure({
          url,
          init,
          requestId,
          attempt,
          maxRetries,
          nextRetryMs,
          response: res
        }), await sleep2(nextRetryMs);
        continue;
      }
      if (!res.ok)
        throw this.logHttpFailure({ url, init, requestId, attempt, maxRetries, response: res }), new Error(`http ${res.status} ${await res.text()}`);
      let data = await res.json();
      if (!(0, import_realtime_contracts.isPushBundleResult)(data))
        throw new Error("invalid push bundle response");
      return data;
    }
  }
};

// ../../packages/sync/src/syncable.ts
var INDEX_FILE3 = "index.html", DERIVED_ARTIFACT_RE2 = /\.(abstract|full|overview)\.html$/i;
function isSyncable(treeRelPath) {
  let p = treeRelPath.replace(/\\/g, "/");
  return !(p.startsWith("../") || p.includes("/../") || p === ".." || p.startsWith(".brv/") || p.includes("/.brv/") || !p.toLowerCase().endsWith(".html") || p === INDEX_FILE3 || DERIVED_ARTIFACT_RE2.test(p));
}

// ../../packages/sync/src/delete-intent.ts
import { randomUUID as randomUUID5 } from "node:crypto";
import {
  chmod as chmod3,
  mkdir as mkdir13,
  readFile as readFile18,
  readdir as readdir5,
  rename as rename8,
  rm as rm14,
  writeFile as writeFile12
} from "node:fs/promises";
import { join as join20 } from "node:path";
var DELETE_INTENT_TTL_MS = 1440 * 60 * 1e3, DELETE_INTENTS_DIR = "delete-intents";
function intentsDir(syncDir) {
  return join20(syncDir, DELETE_INTENTS_DIR);
}
function parseIntent(raw, now) {
  if (typeof raw != "object" || raw === null) return null;
  let rec = raw;
  if (rec.schemaVersion !== 1 || typeof rec.id != "string" || rec.id.length === 0 || typeof rec.prefix != "string" || rec.prefix.length === 0 || typeof rec.createdAt != "string" || typeof rec.expiresAt != "string" || rec.authGeneration !== void 0 && typeof rec.authGeneration != "string")
    return null;
  let expiresAt = Date.parse(rec.expiresAt);
  return Number.isNaN(expiresAt) || expiresAt <= now.getTime() ? null : {
    schemaVersion: 1,
    id: rec.id,
    prefix: rec.prefix,
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt,
    ...typeof rec.authGeneration == "string" ? { authGeneration: rec.authGeneration } : {}
  };
}
async function writeIntentFile(dir, intent) {
  await mkdir13(dir, { recursive: !0, mode: 448 });
  try {
    await chmod3(dir, 448);
  } catch {
  }
  let tmpPath = join20(dir, `.${intent.id}.${randomUUID5()}.tmp`), finalPath = join20(dir, `${intent.id}.json`);
  await writeFile12(tmpPath, JSON.stringify(intent, null, 2) + `
`, {
    mode: 384
  }), await rename8(tmpPath, finalPath);
}
async function readDeleteIntents(syncDir, opts) {
  let now = opts?.now ?? /* @__PURE__ */ new Date(), dir = intentsDir(syncDir), entries;
  try {
    entries = await readdir5(dir);
  } catch {
    return [];
  }
  let result = [];
  for (let name of entries) {
    if (!name.endsWith(".json")) continue;
    let filePath = join20(dir, name), parsed = null;
    try {
      parsed = parseIntent(JSON.parse(await readFile18(filePath, "utf8")), now);
    } catch {
      parsed = null;
    }
    parsed ? result.push(parsed) : await rm14(filePath, { force: !0 }).catch(() => {
    });
  }
  return result;
}
async function recordDeleteIntent(input) {
  let now = input.now ?? /* @__PURE__ */ new Date(), dir = intentsDir(input.syncDir), duplicate = (await readDeleteIntents(input.syncDir, { now })).find((intent2) => intent2.prefix === input.prefix);
  if (duplicate) return duplicate;
  let intent = {
    schemaVersion: 1,
    id: randomUUID5(),
    prefix: input.prefix,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DELETE_INTENT_TTL_MS).toISOString(),
    ...input.authGeneration ? { authGeneration: input.authGeneration } : {}
  };
  return await writeIntentFile(dir, intent), intent;
}
async function consumeDeleteIntent(syncDir, intentId) {
  await rm14(join20(intentsDir(syncDir), `${intentId}.json`), {
    force: !0
  }).catch(() => {
  });
}
async function clearDeleteIntents(syncDir) {
  await rm14(intentsDir(syncDir), { recursive: !0, force: !0 }).catch(
    () => {
    }
  );
}

// ../../packages/sync/src/move-intent.ts
import { createHash as createHash6, randomUUID as randomUUID6 } from "node:crypto";
import { chmod as chmod4, mkdir as mkdir14, readFile as readFile19, readdir as readdir6, rename as rename9, rm as rm15, writeFile as writeFile13 } from "node:fs/promises";
import { join as join21 } from "node:path";

// ../../packages/sync/src/sync-key.ts
import { posix, win32 } from "node:path";
var MAX_SYNC_KEY_LENGTH = 512;
function parseSyncKey(raw) {
  let normalized = raw;
  if (normalized.length === 0 || normalized.length > MAX_SYNC_KEY_LENGTH || posix.isAbsolute(normalized) || win32.isAbsolute(normalized) || normalized.includes("\\") || normalized.includes(":") || normalized.includes("\0") || /[\u0001-\u001f\u007f]/.test(normalized) || normalized.includes("//"))
    throw new Error(`invalid sync key: ${raw}`);
  if (normalized.split("/").some(
    (segment) => segment.length === 0 || segment === "." || segment === ".."
  ))
    throw new Error(`invalid sync key: ${raw}`);
  if (!isSyncable(normalized))
    throw new Error(`invalid sync key: ${raw}`);
  return normalized;
}

// ../../packages/sync/src/move-intent.ts
var MOVE_INTENT_TTL_MS = 1440 * 60 * 1e3, MOVE_INTENTS_DIR = "move-intents";
function authContextFailure(authContext, now) {
  return authContext.authGeneration.length === 0 ? "missing-auth-generation" : authContext.canWrite !== !0 || authContext.mode !== "bidirectional" ? "read-only-or-pull-only" : authContext.syncState !== "active" || authContext.expiresAt && Date.parse(authContext.expiresAt) <= now.getTime() ? "stale-auth-context" : null;
}
function isMoveContextWritable(ctx, nowMs2) {
  return authContextFailure(ctx, new Date(nowMs2)) === null;
}
async function validateMoveIntentForLocalRename(input) {
  let from, to;
  try {
    from = parseSyncKey(input.from), to = parseSyncKey(input.to);
  } catch {
    return { ok: !1, reason: "invalid-sync-key" };
  }
  let now = input.now ?? /* @__PURE__ */ new Date(), authFailure = authContextFailure(input.authContext, now);
  if (authFailure) return { ok: !1, reason: authFailure };
  if (!input.sourceBaseline)
    return { ok: !1, reason: "missing-source-baseline" };
  if (!input.topicIdentity)
    return { ok: !1, reason: "missing-topic-identity" };
  let destination = await input.destination.readState(to);
  return input.destination.policy === "must-be-absent" && destination.exists ? { ok: !1, reason: "destination-exists" } : input.destination.policy === "must-match-topic-identity" && (!destination.exists || destination.identity !== input.topicIdentity) ? { ok: !1, reason: "destination-identity-mismatch" } : {
    ok: !0,
    from,
    to,
    topicIdentity: input.topicIdentity,
    sourceBaseline: input.sourceBaseline,
    authContext: input.authContext
  };
}
async function prepareMoveIntentForLocalRename(input) {
  let validation = await validateMoveIntentForLocalRename(input);
  if (!validation.ok) return validation;
  try {
    return { ok: !0, intent: await recordMoveIntent({
      syncDir: input.syncDir,
      from: validation.from,
      to: validation.to,
      topicIdentity: validation.topicIdentity,
      sourceBaseline: validation.sourceBaseline,
      authGeneration: validation.authContext.authGeneration,
      now: input.now
    }) };
  } catch {
    return { ok: !1, reason: "record-failed" };
  }
}
function parseIntent2(raw, now) {
  if (typeof raw != "object" || raw === null) return null;
  let rec = raw;
  if (rec.schemaVersion !== 1 || typeof rec.id != "string" || rec.state !== "prepared" || typeof rec.topicIdentity != "string" || typeof rec.createdAt != "string" || typeof rec.expiresAt != "string") return null;
  let from;
  try {
    from = parseSyncKey(rec.from);
  } catch {
    return null;
  }
  let to;
  try {
    to = parseSyncKey(rec.to);
  } catch {
    return null;
  }
  let sb = rec.sourceBaseline;
  if (typeof sb != "object" || sb === null || typeof sb.md5 != "string" || typeof sb.updatedAt != "string")
    return null;
  let expiresAt = Date.parse(rec.expiresAt);
  return Number.isNaN(expiresAt) || expiresAt <= now.getTime() || typeof rec.authGeneration != "string" || rec.authGeneration.length === 0 ? null : {
    schemaVersion: 1,
    id: rec.id,
    state: "prepared",
    from,
    to,
    topicIdentity: rec.topicIdentity,
    sourceBaseline: sb,
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt,
    authGeneration: rec.authGeneration
  };
}
function intentsDir2(syncDir) {
  return join21(syncDir, MOVE_INTENTS_DIR);
}
function serialiseIntent(intent) {
  return {
    ...intent,
    from: intent.from,
    to: intent.to
  };
}
function moveIntentId(input) {
  return createHash6("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);
}
async function writeIntentFile2(dir, intent) {
  await mkdir14(dir, { recursive: !0, mode: 448 });
  try {
    await chmod4(dir, 448);
  } catch {
  }
  let tmpPath = join21(dir, `.${intent.id}.${randomUUID6()}.tmp`), finalPath = join21(dir, `${intent.id}.json`);
  await writeFile13(tmpPath, JSON.stringify(serialiseIntent(intent), null, 2) + `
`, {
    mode: 384
  });
  try {
    await chmod4(tmpPath, 384);
  } catch {
  }
  await rename9(tmpPath, finalPath);
}
async function readLegacyFileRaw(syncDir) {
  try {
    let raw = await readFile19(join21(syncDir, "move-intents.json"), "utf8"), parsed = JSON.parse(raw);
    if (typeof parsed == "object" && parsed !== null && parsed.schemaVersion === 1 && Array.isArray(parsed.intents))
      return parsed.intents;
  } catch {
    return [];
  }
  return [];
}
async function readMoveIntents(syncDir, opts) {
  let now = opts?.now ?? /* @__PURE__ */ new Date(), dir = intentsDir2(syncDir), result = [], names = [];
  try {
    names = await readdir6(dir);
  } catch {
    names = [];
  }
  for (let name of names) {
    if (!name.endsWith(".json")) continue;
    let filePath = join21(dir, name), content;
    try {
      content = await readFile19(filePath, "utf8");
    } catch {
      continue;
    }
    let parsed = null;
    try {
      parsed = parseIntent2(JSON.parse(content), now);
    } catch {
      parsed = null;
    }
    parsed ? result.push(parsed) : await rm15(filePath, { force: !0 }).catch(() => {
    });
  }
  for (let entry of await readLegacyFileRaw(syncDir)) {
    let parsed = parseIntent2(entry, now);
    parsed && !result.some((intent) => intent.id === parsed.id) && (result.push(parsed), opts?.compact && await writeIntentFile2(dir, parsed).catch(() => {
    }));
  }
  return opts?.compact && await rm15(join21(syncDir, "move-intents.json"), { force: !0 }).catch(() => {
  }), result;
}
async function recordMoveIntent(input) {
  let { syncDir, from, to, topicIdentity, sourceBaseline, authGeneration } = input, now = input.now ?? /* @__PURE__ */ new Date(), fromKey = parseSyncKey(from), toKey2 = parseSyncKey(to), duplicate = (await readMoveIntents(syncDir, { now })).find(
    (intent2) => intent2.from === from && intent2.to === to && intent2.topicIdentity === topicIdentity && intent2.sourceBaseline.md5 === sourceBaseline.md5 && intent2.sourceBaseline.updatedAt === sourceBaseline.updatedAt && intent2.authGeneration === authGeneration
  );
  if (duplicate) return duplicate;
  let createdAt = now.toISOString(), intent = {
    schemaVersion: 1,
    id: moveIntentId({
      from,
      to,
      topicIdentity,
      sourceBaseline,
      authGeneration
    }),
    state: "prepared",
    from: fromKey,
    to: toKey2,
    topicIdentity,
    sourceBaseline,
    createdAt,
    expiresAt: new Date(now.getTime() + MOVE_INTENT_TTL_MS).toISOString(),
    authGeneration
  };
  return await writeIntentFile2(intentsDir2(syncDir), intent), intent;
}
async function consumeMoveIntent(syncDir, intentId) {
  await rm15(join21(intentsDir2(syncDir), `${intentId}.json`), {
    force: !0
  }).catch(() => {
  });
}
async function dropInvalidMoveIntent(syncDir, intentId) {
  await consumeMoveIntent(syncDir, intentId);
}
async function clearMoveIntents(syncDir) {
  await rm15(intentsDir2(syncDir), { recursive: !0, force: !0 }).catch(() => {
  }), await rm15(join21(syncDir, "move-intents.json"), { force: !0 }).catch(() => {
  });
}

// ../../packages/sync/src/state.ts
var BASELINE_KEY = "baseline", BASELINE_REVISION_KEY = "baselineRevision", STATUS_KEY = "status", DEFAULT_STATUS = {
  running: !1,
  state: "idle",
  wsState: "degraded",
  conflicts: [],
  rejected: [],
  pendingError: null
}, SyncState = class {
  constructor(syncDir) {
    this.syncDir = syncDir;
    this.kv = new FileKeyStorage(syncDir);
  }
  kv;
  async getBaseline() {
    return await this.kv.get(BASELINE_KEY) ?? {};
  }
  async setBaseline(b) {
    await this.kv.set(BASELINE_KEY, b);
  }
  async getBaselineRevision() {
    let value = await this.kv.get(BASELINE_REVISION_KEY);
    return typeof value == "number" ? value : null;
  }
  async setBaselineRevision(rev) {
    await this.kv.set(BASELINE_REVISION_KEY, rev);
  }
  async getStatus() {
    let stored = await this.kv.get(STATUS_KEY);
    return { ...DEFAULT_STATUS, ...stored };
  }
  async setStatus(s) {
    await this.kv.set(STATUS_KEY, s);
  }
  async getMoveIntents(now = /* @__PURE__ */ new Date(), opts) {
    return readMoveIntents(this.syncDir, { now, compact: opts?.compact });
  }
  async consumeMoveIntent(intentId) {
    await consumeMoveIntent(this.syncDir, intentId);
  }
  async dropInvalidMoveIntent(intentId) {
    await dropInvalidMoveIntent(this.syncDir, intentId);
  }
  async clearMoveIntents() {
    await clearMoveIntents(this.syncDir);
  }
  async getDeleteIntents(now = /* @__PURE__ */ new Date()) {
    return readDeleteIntents(this.syncDir, { now });
  }
  async consumeDeleteIntent(intentId) {
    await consumeDeleteIntent(this.syncDir, intentId);
  }
  async clearDeleteIntents() {
    await clearDeleteIntents(this.syncDir);
  }
};

// ../../packages/sync/src/daemon-auth-store.ts
import {
  createCipheriv as createCipheriv2,
  createDecipheriv as createDecipheriv2,
  createHash as createHash7,
  randomBytes as randomBytes6
} from "node:crypto";
import { chmod as chmod5, mkdir as mkdir15, readFile as readFile20, rename as rename10, writeFile as writeFile14, rm as rm16 } from "node:fs/promises";
import { basename as basename2, dirname as dirname10, join as join22 } from "node:path";
var DAEMON_AUTH_KEY_BYTES = 32;
var DAEMON_AUTH_KEY_FILENAME = "daemon-auth.key";
function daemonAuthPath(projectsRoot) {
  return join22(projectsRoot, ".daemon", "auth.json");
}
function daemonAuthKeyPath(authPath) {
  let daemonDir2 = dirname10(authPath), projectsRoot = dirname10(daemonDir2), dataRoot = dirname10(projectsRoot);
  return basename2(daemonDir2) === ".daemon" && basename2(projectsRoot) === "projects" && dataRoot !== dirname10(dataRoot) ? join22(dataRoot, DAEMON_AUTH_KEY_FILENAME) : join22(daemonDir2, "auth.key");
}
function parseDaemonAuthKey(raw) {
  try {
    let record = JSON.parse(raw);
    if (record.schemaVersion !== 1 || record.alg !== "AES-256-GCM" || typeof record.key != "string")
      return null;
    let key = Buffer.from(record.key, "base64url");
    return key.length === DAEMON_AUTH_KEY_BYTES ? key : null;
  } catch {
    return null;
  }
}
async function readDaemonAuthKey(path2) {
  try {
    return parseDaemonAuthKey(await readFile20(path2, "utf8"));
  } catch {
    return null;
  }
}
function daemonDeviceSessionAad(record) {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: record.schemaVersion,
      provider: record.provider,
      refreshExpiresAt: record.refreshExpiresAt,
      refreshAbsoluteExpiresAt: record.refreshAbsoluteExpiresAt,
      deviceId: record.deviceId,
      sessionId: record.sessionId,
      tokenFingerprint: record.tokenFingerprint
    }),
    "utf8"
  );
}
function isEncryptedDaemonDeviceSession(value) {
  let encrypted = value.refreshTokenEncrypted;
  return value.provider === "daemon-device-session" && encrypted !== void 0 && encrypted.schemaVersion === 1 && encrypted.alg === "AES-256-GCM" && typeof encrypted.iv == "string" && typeof encrypted.ciphertext == "string" && typeof encrypted.tag == "string";
}
function isPlaintextDaemonDeviceSession(value) {
  return value.provider === "daemon-device-session" && typeof value.refreshToken == "string";
}
async function decryptDaemonDeviceSession(path2, record) {
  let key = await readDaemonAuthKey(daemonAuthKeyPath(path2));
  if (!key) return null;
  let { refreshTokenEncrypted, ...publicRecord } = record;
  try {
    let decipher = createDecipheriv2(
      "aes-256-gcm",
      key,
      Buffer.from(refreshTokenEncrypted.iv, "base64url")
    );
    decipher.setAAD(daemonDeviceSessionAad(publicRecord)), decipher.setAuthTag(Buffer.from(refreshTokenEncrypted.tag, "base64url"));
    let refreshToken = Buffer.concat([
      decipher.update(
        Buffer.from(refreshTokenEncrypted.ciphertext, "base64url")
      ),
      decipher.final()
    ]).toString("utf8");
    return {
      ...publicRecord,
      refreshToken
    };
  } catch {
    return null;
  } finally {
    key.fill(0);
  }
}
async function readDaemonAuth(path2) {
  try {
    let raw = await readFile20(path2, "utf8"), record = JSON.parse(raw);
    return isEncryptedDaemonDeviceSession(record) ? decryptDaemonDeviceSession(path2, record) : record.provider === "daemon-device-session" && !isPlaintextDaemonDeviceSession(record) ? null : record;
  } catch {
    return null;
  }
}

// ../../packages/sync/src/daemon-status.ts
var import_realtime_contracts2 = __toESM(require_realtime_contracts());
import { constants } from "node:fs";
import { open as open4, readFile as readFile21 } from "node:fs/promises";
import { join as join23 } from "node:path";

// ../../packages/sync/src/daemon-auth-identity.ts
import { createHash as createHash8 } from "node:crypto";
function isNonEmptyString3(value) {
  return typeof value == "string" && value.trim().length > 0;
}
function hasDeviceSessionCredential(record) {
  if (isNonEmptyString3(record.refreshToken)) return !0;
  let encrypted = record.refreshTokenEncrypted;
  if (!encrypted || typeof encrypted != "object" || Array.isArray(encrypted))
    return !1;
  let envelope = encrypted;
  return envelope.schemaVersion === 1 && envelope.alg === "AES-256-GCM" && isNonEmptyString3(envelope.iv) && isNonEmptyString3(envelope.ciphertext) && isNonEmptyString3(envelope.tag);
}
function parseDaemonAuthIdentity(raw) {
  if (raw == null)
    return { ok: !0, identity: { providerKind: "none" } };
  if (!raw || typeof raw != "object" || Array.isArray(raw))
    return { ok: !1, reason: "malformed-auth" };
  let record = raw;
  return record.provider === "daemon-device-session" ? !isNonEmptyString3(record.sessionId) || !hasDeviceSessionCredential(record) ? { ok: !1, reason: "malformed-auth" } : {
    ok: !0,
    identity: {
      providerKind: "daemon-device-session",
      sessionId: record.sessionId
    }
  } : record.provider === "api-key" ? isNonEmptyString3(record.tokenFingerprint) ? {
    ok: !0,
    identity: {
      providerKind: "api-key",
      tokenFingerprint: record.tokenFingerprint
    }
  } : { ok: !1, reason: "malformed-auth" } : { ok: !1, reason: "malformed-auth" };
}
function lengthPrefixed(value) {
  return `${value.length}:${value}`;
}
function canonicalIdentityString(identity) {
  switch (identity.providerKind) {
    case "daemon-device-session":
      return [
        "byterover.daemon-auth-identity.v1",
        lengthPrefixed("daemon-device-session"),
        lengthPrefixed(identity.sessionId)
      ].join("|");
    case "api-key":
      return [
        "byterover.daemon-auth-identity.v1",
        lengthPrefixed("api-key"),
        lengthPrefixed(identity.tokenFingerprint)
      ].join("|");
    case "none":
      return ["byterover.daemon-auth-identity.v1", lengthPrefixed("none")].join(
        "|"
      );
  }
}
function toDaemonAuthMarkerIdentity(identity) {
  return {
    providerKind: identity.providerKind,
    identityDigest: "v1:" + createHash8("sha256").update(canonicalIdentityString(identity)).digest("hex")
  };
}
function parseDaemonAuthMarkerIdentity(raw) {
  if (!raw || typeof raw != "object" || Array.isArray(raw))
    return { ok: !1, reason: "malformed-marker-identity" };
  let record = raw, providerKind = record.providerKind, identityDigest = record.identityDigest;
  return providerKind !== "daemon-device-session" && providerKind !== "api-key" && providerKind !== "none" ? { ok: !1, reason: "malformed-marker-identity" } : typeof identityDigest != "string" || !/^v1:[a-f0-9]{64}$/.test(identityDigest) ? { ok: !1, reason: "malformed-marker-identity" } : { ok: !0, identity: { providerKind, identityDigest } };
}
function authIdentitiesEqual(expected, running) {
  return expected.providerKind === running.providerKind && expected.identityDigest === running.identityDigest;
}

// ../../packages/sync/src/daemon-status.ts
var DAEMON_PID_MAX_BYTES = 16 * 1024, DAEMON_STATUS_V2_MAX_BYTES = 64 * 1024, DAEMON_READY_V2_MAX_BYTES = 16 * 1024, DAEMON_SPACES_INDEX_V2_MAX_BYTES = 512 * 1024, DAEMON_SPACE_STATUS_V2_MAX_BYTES = 256 * 1024, DAEMON_SPACE_READY_V2_MAX_BYTES = 16 * 1024, DAEMON_STATUS_V1_FALLBACK_MAX_BYTES = 2 * 1024 * 1024, DAEMON_READY_V1_FALLBACK_MAX_BYTES = 1 * 1024 * 1024;
function daemonStatusPath(projectsRoot) {
  return join23(projectsRoot, ".daemon", "status.json");
}
function assertSafeDaemonSpaceId(spaceId) {
  if (!normalizeUuidLike(spaceId))
    throw new Error(`invalid daemon space id: ${spaceId}`);
}
function daemonReadyPath(projectsRoot) {
  return join23(projectsRoot, ".daemon", "ready.json");
}
function daemonSpacesDir(projectsRoot) {
  return join23(projectsRoot, ".daemon", "spaces");
}
function daemonSpaceReadyPath(projectsRoot, spaceId) {
  return assertSafeDaemonSpaceId(spaceId), join23(daemonSpacesDir(projectsRoot), spaceId, "ready.json");
}
function normalizeAuthState(value) {
  return value === "auth-expired" || value === "auth_expired" ? "auth_expired" : value === "not_configured" || value === "signed_out" || value === "provisioning" || value === "starting" || value === "transient_error" || value === "credential_persistence_error" || value === "running" ? value : null;
}
function normalizeProviderKind(value) {
  return value === "api-key" || value === "daemon-device-session" || value === "none" ? value : null;
}
function normalizeCapabilityRefreshResult(value) {
  return value === "success" || value === "error" ? value : void 0;
}
function normalizeCapabilitySocketState(value) {
  if (value === "connected" || value === "reconnecting" || value === "degraded")
    return value;
}
function normalizeWarnings(value) {
  if (!Array.isArray(value)) return;
  let warnings = value.filter(
    (entry) => typeof entry == "string" && entry.length > 0 && entry.length <= 80 && !entry.includes("/") && !entry.includes("\\") && !entry.includes("Bearer ") && !entry.includes("brv_")
  );
  return warnings.length > 0 ? warnings : void 0;
}
function isTokenLike(value) {
  return /\bBearer\s+/i.test(value) || /brv_(desktop|daemon|api|sync)_[A-Za-z0-9_-]+/.test(value);
}
function normalizeUuidLike(value) {
  if (typeof value == "string")
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    ) ? value : void 0;
}
function isRecord2(value) {
  return typeof value == "object" && value !== null && !Array.isArray(value);
}
function normalizeDaemonInstanceId(value) {
  if (typeof value != "string") return null;
  let trimmed = value.trim();
  return trimmed.length === 0 || trimmed.length > 256 || /[\x00-\x1F\x7F]/.test(trimmed) || isTokenLike(trimmed) ? null : trimmed;
}
function normalizeRevision(value) {
  return isSafeNonNegInt(value) ? value : null;
}
function normalizeIsoDate(value) {
  if (typeof value != "string") return null;
  let time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}
function normalizeNullableIsoDate(value) {
  return value === null ? null : normalizeIsoDate(value) ?? void 0;
}
function normalizeNullableString(value) {
  if (value === null) return null;
  if (typeof value == "string")
    return value;
}
function isSafeNonNegInt(value) {
  return typeof value == "number" && Number.isSafeInteger(value) && value >= 0;
}
function normalizeRecentCompletion(value) {
  if (typeof value != "object" || value === null || Array.isArray(value))
    return;
  let rec = value, changedCount = rec.changedCount, completedAt = rec.completedAt, batchId = rec.batchId;
  if (!(typeof changedCount != "number" || !Number.isSafeInteger(changedCount) || changedCount <= 0) && !(typeof completedAt != "string" || Number.isNaN(Date.parse(completedAt))) && !(typeof batchId != "string" || batchId.trim() === "" || batchId.length > 80))
    return { changedCount, completedAt, batchId };
}
var FAST_BOOTSTRAP_MODE_SET = new Set(
  import_realtime_contracts2.FAST_BOOTSTRAP_MODES
), FAST_BOOTSTRAP_PHASE_SET = new Set(
  import_realtime_contracts2.FAST_BOOTSTRAP_PHASES
), FAST_BOOTSTRAP_SEVERITY_SET = new Set(
  import_realtime_contracts2.FAST_BOOTSTRAP_SEVERITIES
), FAST_BOOTSTRAP_STATUS_REASON_SET = new Set(
  import_realtime_contracts2.FAST_BOOTSTRAP_STATUS_REASONS
);
function normalizeDaemonStatusV2(raw) {
  if (!isRecord2(raw) || raw.schemaVersion !== 2) return null;
  let providerKind = normalizeProviderKind(raw.providerKind), authState = normalizeAuthState(raw.authState), daemonInstanceId = normalizeDaemonInstanceId(raw.daemonInstanceId), heartbeatAt = normalizeIsoDate(raw.heartbeatAt), lastExchangeAt = normalizeNullableIsoDate(raw.lastExchangeAt), nextRetryAt = normalizeNullableIsoDate(raw.nextRetryAt), error = normalizeNullableString(raw.error), spacesIndexRevision = normalizeRevision(raw.spacesIndexRevision), spacesIndexUpdatedAt = normalizeNullableIsoDate(
    raw.spacesIndexUpdatedAt
  ), spacesTotal = normalizeRevision(raw.spacesTotal), spacesWithAttention = normalizeRevision(raw.spacesWithAttention), spacesSyncing = normalizeRevision(raw.spacesSyncing);
  if (!providerKind || !authState || !daemonInstanceId || !heartbeatAt || lastExchangeAt === void 0 || nextRetryAt === void 0 || error === void 0 || spacesIndexRevision === null || spacesIndexUpdatedAt === void 0 || spacesTotal === null || spacesWithAttention === null || spacesSyncing === null || raw.registryProjectionMode !== "enabled" && raw.registryProjectionMode !== "disabled")
    return null;
  let authIdentityParse = raw.authIdentity === void 0 ? null : parseDaemonAuthMarkerIdentity(raw.authIdentity), authIdentity = authIdentityParse?.ok === !0 ? authIdentityParse.identity : void 0, lastCapabilityRefreshAt = raw.lastCapabilityRefreshAt === void 0 ? void 0 : normalizeIsoDate(raw.lastCapabilityRefreshAt) ?? void 0, lastCapabilityRefreshErrorCode = raw.lastCapabilityRefreshErrorCode === void 0 ? void 0 : normalizeNullableString(raw.lastCapabilityRefreshErrorCode), lastCapabilityVersion = normalizeRevision(raw.lastCapabilityVersion), warnings = normalizeWarnings(raw.warnings), recentCompletion = normalizeRecentCompletion(raw.recentCompletion);
  return {
    schemaVersion: 2,
    providerKind,
    ...authIdentity ? { authIdentity } : {},
    authState,
    daemonInstanceId,
    heartbeatAt,
    lastExchangeAt,
    nextRetryAt,
    error,
    ...lastCapabilityRefreshAt !== void 0 ? { lastCapabilityRefreshAt } : {},
    ...raw.lastCapabilityRefreshResult !== void 0 ? {
      lastCapabilityRefreshResult: normalizeCapabilityRefreshResult(
        raw.lastCapabilityRefreshResult
      )
    } : {},
    ...lastCapabilityRefreshErrorCode !== void 0 ? { lastCapabilityRefreshErrorCode } : {},
    ...lastCapabilityVersion !== null ? { lastCapabilityVersion } : {},
    ...normalizeCapabilitySocketState(raw.capabilitySocketState) ? {
      capabilitySocketState: normalizeCapabilitySocketState(
        raw.capabilitySocketState
      )
    } : {},
    registryProjectionMode: raw.registryProjectionMode,
    ...warnings ? { warnings } : {},
    ...recentCompletion ? { recentCompletion } : {},
    spacesIndexRevision,
    spacesIndexUpdatedAt,
    spacesTotal,
    spacesWithAttention,
    spacesSyncing
  };
}
function normalizeMoveAuthGeneration(value) {
  if (typeof value != "string") return;
  let trimmed = value.trim();
  if (!(trimmed.length === 0 || trimmed.length > 256) && !/[\x00-\x1F\x7F]/.test(trimmed) && !isTokenLike(trimmed))
    return trimmed;
}
function normalizeMoveIntentAuthContext(value) {
  if (!isRecord2(value)) return;
  let spaceId = normalizeUuidLike(value.spaceId);
  if (!spaceId) return;
  let authGeneration = normalizeMoveAuthGeneration(value.authGeneration);
  if (!authGeneration || typeof value.canWrite != "boolean" || value.mode !== "bidirectional" && value.mode !== "pull-only" || value.syncState !== "active" && value.syncState !== "paused")
    return;
  let capturedAt = normalizeIsoDate(value.capturedAt);
  if (!capturedAt) return;
  let teamId = normalizeUuidLike(value.teamId), expiresAt = value.expiresAt === void 0 ? void 0 : normalizeIsoDate(value.expiresAt) ?? void 0;
  return {
    spaceId,
    ...teamId ? { teamId } : {},
    authGeneration,
    canWrite: value.canWrite,
    mode: value.mode,
    syncState: value.syncState,
    capturedAt,
    ...expiresAt !== void 0 ? { expiresAt } : {}
  };
}
function normalizeDaemonSpaceReadyV2(raw) {
  if (!isRecord2(raw) || raw.schemaVersion !== 2) return null;
  let daemonInstanceId = normalizeDaemonInstanceId(raw.daemonInstanceId), spaceId = normalizeUuidLike(raw.spaceId), readyRevision = normalizeRevision(raw.readyRevision), updatedAt = normalizeIsoDate(raw.updatedAt), moveIntentAuthContext = normalizeMoveIntentAuthContext(
    raw.moveIntentAuthContext
  ), baselineEstablishedAt = raw.baselineEstablishedAt === void 0 ? void 0 : normalizeIsoDate(raw.baselineEstablishedAt) ?? void 0, watchEnabledAt = raw.watchEnabledAt === void 0 ? void 0 : normalizeIsoDate(raw.watchEnabledAt) ?? void 0, bootstrapError = normalizeNullableString(raw.bootstrapError);
  return !daemonInstanceId || !spaceId || typeof raw.ready != "boolean" || readyRevision === null || !updatedAt || bootstrapError === void 0 ? null : {
    schemaVersion: 2,
    daemonInstanceId,
    spaceId,
    ready: raw.ready,
    readyRevision,
    updatedAt,
    ...baselineEstablishedAt !== void 0 ? { baselineEstablishedAt } : {},
    ...watchEnabledAt !== void 0 ? { watchEnabledAt } : {},
    bootstrapError,
    ...moveIntentAuthContext ? { moveIntentAuthContext } : {}
  };
}
async function defaultReadJson(path2, maxBytes2 = DAEMON_STATUS_V2_MAX_BYTES) {
  let handle;
  try {
    let noFollow = typeof constants.O_NOFOLLOW == "number" ? constants.O_NOFOLLOW : 0;
    handle = await open4(path2, constants.O_RDONLY | noFollow);
    let fileStat = await handle.stat();
    if (!fileStat.isFile() || fileStat.size > maxBytes2 || !Number.isSafeInteger(fileStat.size) || fileStat.size < 0) return null;
    let buffer = Buffer.alloc(fileStat.size), { bytesRead } = await handle.read(buffer, 0, fileStat.size, 0);
    if (bytesRead > maxBytes2) return null;
    let raw = buffer.subarray(0, bytesRead).toString("utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {
    });
  }
}
async function regularFileExistsNoFollow(path2) {
  let handle;
  try {
    let noFollow = typeof constants.O_NOFOLLOW == "number" ? constants.O_NOFOLLOW : 0;
    return handle = await open4(path2, constants.O_RDONLY | noFollow), (await handle.stat()).isFile();
  } catch {
    return !1;
  } finally {
    await handle?.close().catch(() => {
    });
  }
}
function normalizeLegacySpaceReady(raw, spaceId) {
  if (!isRecord2(raw)) return null;
  let spaces = raw.spaces;
  if (!isRecord2(spaces)) return null;
  let entry = spaces[spaceId];
  if (!isRecord2(entry)) return null;
  let bootstrapError = normalizeNullableString(entry.bootstrapError);
  if (bootstrapError === void 0) return null;
  let baselineEstablishedAt = entry.baselineEstablishedAt === void 0 ? void 0 : normalizeIsoDate(entry.baselineEstablishedAt) ?? void 0, watchEnabledAt = entry.watchEnabledAt === void 0 ? void 0 : normalizeIsoDate(entry.watchEnabledAt) ?? void 0;
  return {
    bootstrapError,
    ...baselineEstablishedAt !== void 0 ? { baselineEstablishedAt } : {},
    ...watchEnabledAt !== void 0 ? { watchEnabledAt } : {}
  };
}
async function readLegacySpaceReady(input) {
  let raw = await input.readJson(
    daemonReadyPath(input.projectsRoot),
    DAEMON_READY_V1_FALLBACK_MAX_BYTES
  ), ready = normalizeLegacySpaceReady(raw, input.spaceId);
  return ready ? { sourceSchema: 1, source: "legacy-global", ready } : null;
}
async function readDaemonStatusEnvelope(input) {
  let raw = await (input.readJson ?? defaultReadJson)(
    daemonStatusPath(input.projectsRoot),
    DAEMON_STATUS_V1_FALLBACK_MAX_BYTES
  );
  if (!isRecord2(raw)) return { schemaVersion: null, daemonInstanceId: null };
  if (raw.schemaVersion === 2) {
    let status = normalizeDaemonStatusV2(raw);
    return status ? { schemaVersion: 2, daemonInstanceId: status.daemonInstanceId } : { schemaVersion: "invalid-v2", daemonInstanceId: null };
  }
  return raw.schemaVersion === 1 || raw.schemaVersion === void 0 ? { schemaVersion: 1, daemonInstanceId: null } : { schemaVersion: null, daemonInstanceId: null };
}
async function readDaemonSpaceReady(input) {
  let readJson = input.readJson ?? defaultReadJson;
  if (input.currentGlobalSchema === 2) {
    if (!input.daemonInstanceId)
      return { sourceSchema: 2, source: "invalid", ready: null };
    let path2;
    try {
      path2 = daemonSpaceReadyPath(input.projectsRoot, input.spaceId);
    } catch {
      return { sourceSchema: 2, source: "invalid", ready: null };
    }
    let raw = await readJson(path2, DAEMON_SPACE_READY_V2_MAX_BYTES);
    if (raw === null)
      return !input.readJson && await regularFileExistsNoFollow(path2) ? { sourceSchema: 2, source: "invalid", ready: null } : null;
    let ready = normalizeDaemonSpaceReadyV2(raw);
    return !ready || ready.daemonInstanceId !== input.daemonInstanceId || ready.spaceId !== input.spaceId ? { sourceSchema: 2, source: "invalid", ready: null } : { sourceSchema: 2, source: "per-space", ready };
  }
  return readLegacySpaceReady({
    projectsRoot: input.projectsRoot,
    spaceId: input.spaceId,
    readJson
  });
}

// src/sync/move-write-context.ts
import { dirname as dirname12 } from "node:path";

// src/sync/capability.ts
import { mkdir as mkdir16, readFile as readFile22, rename as rename11, writeFile as writeFile15 } from "node:fs/promises";
import { basename as basename3, join as join24 } from "node:path";
function validateCapabilityRecord(record) {
  if (record.capability_source !== "jwt" && record.capability_source !== "projection")
    return { kind: "invalid", reason: "invalid capability_source" };
  if (typeof record.space_id != "string" || !isUuid(record.space_id))
    return { kind: "invalid", reason: "invalid space_id" };
  if (typeof record.space_name != "string" || record.space_name.trim() === "")
    return { kind: "invalid", reason: "invalid space_name" };
  if (typeof record.team_id != "string" || !isUuid(record.team_id))
    return { kind: "invalid", reason: "invalid team_id" };
  if (record.sync_state !== "active" && record.sync_state !== "paused")
    return { kind: "invalid", reason: "invalid sync_state" };
  if (record.sync_disabled_reason !== null && typeof record.sync_disabled_reason != "string")
    return { kind: "invalid", reason: "invalid sync_disabled_reason" };
  if (typeof record.can_read != "boolean" || typeof record.can_write != "boolean")
    return { kind: "invalid", reason: "invalid capability booleans" };
  if (!Array.isArray(record.scopes))
    return { kind: "invalid", reason: "invalid scopes" };
  if (!record.scopes.every(
    (s) => s === "space:read" || s === "space:write"
  ))
    return { kind: "invalid", reason: "invalid scope value" };
  let scopes = record.scopes, expectedCanRead = record.sync_state === "active" && scopes.includes("space:read"), expectedCanWrite = record.sync_state === "active" && scopes.includes("space:write");
  return record.can_read !== expectedCanRead || record.can_write !== expectedCanWrite ? {
    kind: "invalid",
    reason: "derived capability mismatch"
  } : record.can_write && !record.can_read ? {
    kind: "invalid",
    reason: "space:write requires space:read"
  } : Number.isNaN(Date.parse(String(record.token_expires_at))) ? { kind: "invalid", reason: "invalid token_expires_at" } : Number.isNaN(
    Date.parse(String(record.last_capability_refresh_at))
  ) ? { kind: "invalid", reason: "invalid last_capability_refresh_at" } : {
    kind: "ok",
    capability: record
  };
}
async function readCapability(spaceDir) {
  let path2 = join24(syncStateDirForSpaceDir(spaceDir), "capability.json"), raw;
  try {
    raw = await readFile22(path2, "utf8");
  } catch (err) {
    if (err.code === "ENOENT")
      return { kind: "missing" };
    throw err;
  }
  try {
    let record = JSON.parse(raw), baseResult = validateCapabilityRecord(record);
    return baseResult.kind !== "ok" ? baseResult : basename3(spaceDir) !== record.space_id ? { kind: "invalid", reason: "space_id mismatch" } : baseResult;
  } catch (err) {
    if (err instanceof SyntaxError)
      return {
        kind: "invalid",
        reason: `invalid JSON: ${err.message}`
      };
    throw err;
  }
}

// src/sync/cloud-resolver.ts
import { access as access2, readdir as readdir7, readFile as readFile24 } from "node:fs/promises";
import { basename as basename4, dirname as dirname11, join as join26 } from "node:path";

// src/sync/cloud-projects.ts
import { join as join25 } from "node:path";
function isUuid2(value) {
  return isUuid(value);
}
function cloudSpaceDir(projectsRoot, spaceId) {
  if (!isUuid2(spaceId)) throw new Error(`invalid space_id: ${spaceId}`);
  return join25(projectsRoot, spaceId);
}

// src/sync/readiness.ts
import { constants as constants2 } from "node:fs";
import { chmod as chmod6, mkdir as mkdir17, open as open5, readFile as readFile23, rm as rm17, writeFile as writeFile16 } from "node:fs/promises";
var MAX_DAEMON_READY_JSON_BYTES = 64 * 1024;
async function readDaemonReadyJson(path2) {
  let file = null;
  try {
    file = await open5(path2, constants2.O_RDONLY | constants2.O_NOFOLLOW);
    let stat10 = await file.stat();
    if (!stat10.isFile() || stat10.size > MAX_DAEMON_READY_JSON_BYTES) return null;
    let buffer = Buffer.alloc(stat10.size);
    return await file.read(buffer, 0, stat10.size, 0), JSON.parse(buffer.toString("utf8"));
  } catch {
    return null;
  } finally {
    await file?.close();
  }
}

// src/sync/cloud-resolver.ts
async function exists(path2) {
  try {
    return await access2(path2), !0;
  } catch {
    return !1;
  }
}
async function hasCloudSidecar(spaceDir) {
  let syncDir = syncStateDirForSpaceDir(spaceDir);
  return await exists(join26(syncDir, "status.json")) || await exists(join26(syncDir, "capability.json")) || await exists(join26(syncDir, "baseline.json"));
}
async function readDaemonBootstrapStateForSpace(input) {
  let envelope = await readDaemonStatusEnvelope({
    projectsRoot: input.projectsRoot
  });
  if (envelope.schemaVersion === "invalid-v2")
    return {
      kind: "invalid",
      sourceSchema: 2,
      reason: "invalid_v2_status"
    };
  if (envelope.schemaVersion === 2) {
    let v2Ready = await readDaemonSpaceReady({
      projectsRoot: input.projectsRoot,
      spaceId: input.spaceId,
      daemonInstanceId: envelope.daemonInstanceId,
      currentGlobalSchema: 2
    });
    return v2Ready?.sourceSchema === 2 && v2Ready.source === "per-space" ? v2Ready.ready.ready ? {
      kind: "ready",
      sourceSchema: 2,
      bootstrapError: v2Ready.ready.bootstrapError
    } : {
      kind: "not_ready",
      sourceSchema: 2,
      bootstrapError: v2Ready.ready.bootstrapError
    } : v2Ready?.sourceSchema === 2 && v2Ready.source === "invalid" ? {
      kind: "invalid",
      sourceSchema: 2,
      reason: "invalid_v2_ready"
    } : { kind: "missing", sourceSchema: 2 };
  }
  let ready = await readDaemonReadyJson(
    join26(input.projectsRoot, ".daemon", "ready.json")
  );
  if (typeof ready != "object" || ready === null || Array.isArray(ready))
    return { kind: "missing", sourceSchema: envelope.schemaVersion };
  let spaces = ready.spaces;
  if (typeof spaces != "object" || spaces === null || Array.isArray(spaces))
    return { kind: "missing", sourceSchema: envelope.schemaVersion };
  let entry = spaces[input.spaceId];
  if (typeof entry != "object" || entry === null || Array.isArray(entry))
    return { kind: "missing", sourceSchema: envelope.schemaVersion };
  let bootstrapError = entry.bootstrapError;
  return {
    kind: "not_ready",
    sourceSchema: 1,
    bootstrapError: typeof bootstrapError == "string" && bootstrapError !== "" ? bootstrapError : null
  };
}
async function readDaemonBootstrapState(spaceDir) {
  return readDaemonBootstrapStateForSpace({
    projectsRoot: dirname11(spaceDir),
    spaceId: basename4(spaceDir)
  });
}
function v2BootstrapBlocker(state) {
  return state.sourceSchema !== 2 || state.kind === "ready" ? null : state.kind === "invalid" ? { kind: "invalid", reason: state.reason } : state.kind === "missing" ? { kind: "not_ready", reason: "missing_v2_ready" } : state.bootstrapError === "auth_expired" ? null : {
    kind: "not_ready",
    reason: state.bootstrapError ?? "bootstrap_not_ready"
  };
}
function bootstrapErrorForCache(state) {
  return state.kind === "not_ready" ? state.bootstrapError : null;
}
function isV2AuthExpiredCacheRead(state) {
  return state.sourceSchema === 2 && state.kind === "not_ready" && state.bootstrapError === "auth_expired";
}
function isAuthExpiredLocalCache(input) {
  return input.capabilityReason === "auth_expired" || input.daemonBootstrapError === "auth_expired";
}
async function readEngineBootstrapReady(spaceDir) {
  try {
    let raw = await readFile24(
      join26(syncStateDirForSpaceDir(spaceDir), "status.json"),
      "utf8"
    );
    return { kind: "ok", ready: JSON.parse(raw).bootstrapReady === !0 };
  } catch (err) {
    if (err.code === "ENOENT")
      return { kind: "missing" };
    if (err instanceof SyntaxError)
      return { kind: "invalid", reason: "invalid_status_json" };
    throw err;
  }
}
async function hasUsableLocalCache(spaceDir) {
  let status = await readEngineBootstrapReady(spaceDir);
  return status.kind !== "ok" || !status.ready || !await exists(
    join26(syncStateDirForSpaceDir(spaceDir), "baseline.json")
  ) ? !1 : exists(join26(spaceDir, "context-tree"));
}
async function readStrictMetadata(spaceDir) {
  let raw;
  try {
    raw = await readFile24(join26(spaceDir, "metadata.json"), "utf8");
  } catch (err) {
    if (err.code === "ENOENT")
      return { kind: "missing" };
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      kind: "invalid",
      reason: `invalid metadata JSON: ${err.message}`
    };
  }
  if (typeof parsed != "object" || parsed === null || Array.isArray(parsed))
    return { kind: "invalid", reason: "metadata must be an object" };
  let record = parsed;
  return typeof record.created_at != "string" || Number.isNaN(Date.parse(record.created_at)) ? { kind: "invalid", reason: "invalid created_at" } : typeof record.space_id != "string" || !isUuid(record.space_id) ? { kind: "invalid", reason: "invalid space_id" } : typeof record.space_name != "string" || record.space_name.trim() === "" ? { kind: "invalid", reason: "invalid space_name" } : Object.prototype.hasOwnProperty.call(record, "team_id") ? record.team_id !== null && (typeof record.team_id != "string" || !isUuid(record.team_id)) ? { kind: "invalid", reason: "invalid team_id" } : {
    kind: "ok",
    metadata: {
      created_at: record.created_at,
      space_id: record.space_id,
      space_name: record.space_name,
      team_id: record.team_id
    }
  } : { kind: "invalid", reason: "missing team_id" };
}
async function classifyCloudSpace(spaceDir) {
  let metadata = await readStrictMetadata(spaceDir);
  if (metadata.kind === "missing")
    return await hasCloudSidecar(spaceDir) ? { kind: "invalid", reason: "missing metadata with cloud sidecars" } : { kind: "local", reason: "missing_metadata" };
  if (metadata.kind === "invalid")
    return { kind: "invalid", reason: metadata.reason };
  if (basename4(spaceDir) !== metadata.metadata.space_id)
    return { kind: "invalid", reason: "metadata space_id mismatch" };
  let capability = await readCapability(spaceDir);
  if (metadata.metadata.team_id === null && capability.kind !== "ok")
    return { kind: "local", reason: "team_id_null" };
  if (capability.kind === "missing")
    return { kind: "not_ready", reason: "missing_capability" };
  if (capability.kind === "invalid")
    return { kind: "invalid", reason: capability.reason };
  if (metadata.metadata.team_id !== null && capability.capability.team_id !== metadata.metadata.team_id)
    return { kind: "invalid", reason: "capability team_id mismatch" };
  let daemonBootstrapState = await readDaemonBootstrapState(spaceDir), v2Blocker = v2BootstrapBlocker(daemonBootstrapState);
  if (v2Blocker) return v2Blocker;
  let daemonBootstrapError = bootstrapErrorForCache(daemonBootstrapState), authExpiredLocalCache = isAuthExpiredLocalCache({
    capabilityReason: capability.capability.sync_disabled_reason,
    daemonBootstrapError
  });
  if (authExpiredLocalCache && isV2AuthExpiredCacheRead(daemonBootstrapState) && !await hasUsableLocalCache(spaceDir))
    return { kind: "not_ready", reason: "auth_expired" };
  if (!authExpiredLocalCache && Date.parse(capability.capability.token_expires_at) <= Date.now())
    return { kind: "not_ready", reason: "capability_expired" };
  if (!authExpiredLocalCache) {
    let status = await readEngineBootstrapReady(spaceDir);
    if (status.kind === "missing")
      return { kind: "not_ready", reason: "missing_status" };
    if (status.kind === "invalid")
      return { kind: "invalid", reason: status.reason };
    if (!status.ready)
      return { kind: "not_ready", reason: "bootstrap_not_ready" };
    if (!await exists(
      join26(syncStateDirForSpaceDir(spaceDir), "baseline.json")
    ))
      return { kind: "not_ready", reason: "missing_baseline" };
  }
  return {
    kind: "ready",
    space_id: metadata.metadata.space_id,
    space_name: capability.capability.space_name,
    team_id: capability.capability.team_id,
    can_read: authExpiredLocalCache ? !0 : capability.capability.can_read,
    can_write: authExpiredLocalCache ? !0 : capability.capability.can_write,
    root: join26(spaceDir, "context-tree")
  };
}
async function resolveCloudBoundRoot(input) {
  try {
    let resolution = await resolveSpace(input.cwd);
    if (resolution.deleted)
      return {
        kind: "deleted",
        source: resolution.source,
        space_id: resolution.space_id,
        hard: resolution.deleted.hard
      };
    if (resolution.source === "default")
      return {
        kind: "unbound",
        source: "default",
        default_space_id: resolution.space_id
      };
    let spaceDir = cloudSpaceDir(
      input.projectsRoot,
      resolution.space_id
    ), eligibility = await classifyCloudSpace(spaceDir);
    return eligibility.kind === "ready" ? {
      kind: "bound",
      source: resolution.source,
      space_id: eligibility.space_id,
      space_name: eligibility.space_name,
      root: eligibility.root,
      can_read: eligibility.can_read,
      can_write: eligibility.can_write
    } : eligibility.kind === "not_ready" ? {
      kind: "not_ready",
      source: resolution.source,
      space_id: resolution.space_id,
      reason: eligibility.reason
    } : eligibility.kind === "invalid" ? {
      kind: "invalid",
      source: resolution.source,
      space_id: resolution.space_id,
      reason: eligibility.reason
    } : {
      kind: "local",
      source: resolution.source,
      space_id: resolution.space_id
    };
  } catch (err) {
    if (err instanceof NoDefaultSpaceError)
      return { kind: "unbound", source: "none" };
    throw err;
  }
}
async function listQueryableCloudRoots(projectsRoot) {
  let entries;
  try {
    entries = await readdir7(projectsRoot);
  } catch {
    return [];
  }
  let roots = [];
  for (let entry of entries.sort()) {
    if (!isUuid(entry)) continue;
    let eligibility = await classifyCloudSpace(
      cloudSpaceDir(projectsRoot, entry)
    ).catch(
      () => ({
        kind: "invalid",
        reason: "read_failed"
      })
    );
    eligibility.kind !== "ready" || !eligibility.can_read || roots.push({
      space_id: eligibility.space_id,
      space_name: eligibility.space_name,
      team_id: eligibility.team_id,
      root: eligibility.root
    });
  }
  return roots.sort(
    (a, b) => a.space_name.localeCompare(b.space_name) || a.space_id.localeCompare(b.space_id)
  );
}
async function awaitBaselineReady(spaceDir, opts = {}) {
  let timeoutMs = opts.timeout_ms ?? 5e3, intervalMs = opts.interval_ms ?? 250, deadline = Date.now() + timeoutMs;
  for (; ; ) {
    if ((await classifyCloudSpace(spaceDir).catch(
      () => ({
        kind: "not_ready",
        reason: "transient_read_error"
      })
    )).kind === "ready") return !0;
    if (Date.now() >= deadline) return !1;
    await new Promise((resolve11) => setTimeout(resolve11, intervalMs));
  }
}

// src/sync/move-write-context.ts
async function classifyMoveWriteContext(root) {
  let spaceDir = dirname12(root), cloud = await classifyCloudSpace(spaceDir);
  if (cloud.kind === "local") return { kind: "local-only" };
  if (cloud.kind !== "ready")
    return { kind: "not-ready", reason: cloud.reason };
  let capability = await readCapability(spaceDir);
  if (capability.kind !== "ok")
    return { kind: "not-ready", reason: "missing_capability" };
  if (!capability.capability.can_write)
    return { kind: "not-ready", reason: "read_only" };
  if (capability.capability.sync_state !== "active")
    return { kind: "not-ready", reason: "sync_not_active" };
  if (Date.parse(capability.capability.token_expires_at) <= Date.now())
    return { kind: "not-ready", reason: "capability_expired" };
  let projectsRoot = getProjectsDir(), envelope = await readDaemonStatusEnvelope({ projectsRoot });
  if (envelope.schemaVersion !== 2)
    return { kind: "not-ready", reason: "missing_daemon_write_context" };
  let readyModel = await readDaemonSpaceReady({
    projectsRoot,
    spaceId: capability.capability.space_id,
    daemonInstanceId: envelope.daemonInstanceId,
    currentGlobalSchema: 2
  });
  if (readyModel?.sourceSchema !== 2 || readyModel.source !== "per-space")
    return { kind: "not-ready", reason: "missing_daemon_write_context" };
  let ready = readyModel.ready, authContext = ready.moveIntentAuthContext;
  return !ready.ready || !authContext ? { kind: "not-ready", reason: "missing_daemon_write_context" } : authContext.spaceId !== capability.capability.space_id || authContext.teamId !== capability.capability.team_id || !isMoveContextWritable(authContext, Date.now()) ? { kind: "not-ready", reason: "daemon_write_context_mismatch" } : {
    kind: "synced",
    syncDir: syncStateDirForContextTreeRoot(root),
    authContext
  };
}
function moveFailureMessage(reason) {
  switch (reason) {
    case "invalid-sync-key":
      return "cannot move synced topic safely: source or destination path is invalid";
    case "missing-auth-generation":
      return "cannot move synced topic safely: sync is not ready; sign in and retry";
    case "stale-auth-context":
      return "cannot move synced topic safely: sync credentials are stale; restart sync and retry";
    case "read-only-or-pull-only":
      return "cannot move synced topic safely: this space is not writable";
    case "missing-source-baseline":
      return "cannot move synced topic safely: source has no synced baseline; run sync and retry";
    case "missing-topic-identity":
      return "cannot move synced topic safely: topic has no stable identity; run sync and retry";
    case "destination-exists":
      return "cannot move synced topic safely: destination already exists";
    case "destination-identity-mismatch":
      return "cannot move synced topic safely: destination is not the same topic; choose a different path";
    case "record-failed":
      return "cannot move synced topic safely: move intent could not be recorded; check local disk permissions";
    default:
      return "cannot move synced topic safely: sync is not ready; sign in and retry";
  }
}

// src/space-identity.ts
import { chmod as chmod7, mkdir as mkdir18, readFile as readFile25, unlink as unlink2, writeFile as writeFile17 } from "node:fs/promises";
import { join as join27 } from "node:path";
var publicIdentityPath = (spaceDir) => join27(spaceDir, "identity.json"), privateKeyDir = (spaceDir) => join27(spaceDir, "identity"), plaintextKeyPath = (spaceDir, spaceId) => join27(privateKeyDir(spaceDir), `${spaceId}.key.pem`);
function resolvePassphrase(opts) {
  return opts?.passphrase;
}
async function readRecord(spaceDir) {
  let raw;
  try {
    raw = await readFile25(publicIdentityPath(spaceDir), "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
  let obj = JSON.parse(raw);
  return typeof obj.space_id != "string" || typeof obj.fingerprint != "string" || typeof obj.publicKeyPem != "string" || typeof obj.jwkThumbprint != "string" ? null : {
    space_id: obj.space_id,
    fingerprint: obj.fingerprint,
    publicKeyPem: obj.publicKeyPem,
    jwkThumbprint: obj.jwkThumbprint,
    key_storage: obj.key_storage === "encrypted" ? "encrypted" : "plaintext",
    created_at: typeof obj.created_at == "string" ? obj.created_at : ""
  };
}
function toPublic(record) {
  return {
    space_id: record.space_id,
    fingerprint: record.fingerprint,
    publicKeyPem: record.publicKeyPem,
    jwkThumbprint: record.jwkThumbprint
  };
}
async function readSpaceIdentity(spaceDir) {
  let record = await readRecord(spaceDir);
  return record ? toPublic(record) : null;
}
var delay3 = (ms) => new Promise((resolve11) => setTimeout(resolve11, ms));
async function waitForRecord(spaceDir, tries = 50, delayMs = 20) {
  for (let i = 0; i < tries; i++) {
    let record = await readRecord(spaceDir);
    if (record) return record;
    await delay3(delayMs);
  }
  return null;
}
async function persistNewIdentity(spaceDir, spaceId, opts) {
  let { publicKeyPem, privateKeyPem } = generateTreeKeyPair(), passphrase = resolvePassphrase(opts), keyStorage = passphrase ? "encrypted" : "plaintext";
  if (passphrase)
    await new FileEncryptedKeyStore(privateKeyDir(spaceDir)).save(
      spaceId,
      privateKeyPem,
      passphrase
    );
  else {
    let keyPath = plaintextKeyPath(spaceDir, spaceId);
    await writeFile17(keyPath, privateKeyPem, { mode: 384 }), await chmod7(keyPath, 384);
  }
  let record = {
    space_id: spaceId,
    fingerprint: fingerprint(publicKeyPem),
    publicKeyPem,
    jwkThumbprint: jwkThumbprint(publicKeyPem),
    key_storage: keyStorage,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  return await writeFile17(
    publicIdentityPath(spaceDir),
    `${JSON.stringify(record, null, 2)}
`,
    { mode: 420 }
  ), toPublic(record);
}
async function getOrCreateSpaceIdentity(spaceDir, spaceId, opts) {
  let existing = await readRecord(spaceDir);
  if (existing) return toPublic(existing);
  await mkdir18(privateKeyDir(spaceDir), { recursive: !0, mode: 448 }), await chmod7(privateKeyDir(spaceDir), 448);
  let lockPath2 = join27(privateKeyDir(spaceDir), `${spaceId}.lock`), won = !1;
  try {
    await writeFile17(lockPath2, String(process.pid), { flag: "wx", mode: 384 }), won = !0;
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
  if (!won) {
    let adopted = await waitForRecord(spaceDir);
    if (adopted) return toPublic(adopted);
    throw new Error(
      `space identity creation did not complete; remove ${lockPath2} and retry`
    );
  }
  try {
    let racePublished = await readRecord(spaceDir);
    return racePublished ? toPublic(racePublished) : await persistNewIdentity(spaceDir, spaceId, opts);
  } finally {
    await unlink2(lockPath2).catch(() => {
    });
  }
}
async function loadSpacePrivateKey(spaceDir, spaceId, opts) {
  let record = await readRecord(spaceDir);
  if (!record) return null;
  if (record.key_storage === "encrypted") {
    let passphrase = resolvePassphrase(opts);
    if (!passphrase)
      throw new Error(
        "space identity key is encrypted; set BRV_KEY_PASSPHRASE to use it"
      );
    return new FileEncryptedKeyStore(privateKeyDir(spaceDir)).load(
      spaceId,
      passphrase
    );
  }
  try {
    return await readFile25(plaintextKeyPath(spaceDir, spaceId), "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

// src/sync/config.ts
import {
  access as access3,
  chmod as chmod8,
  mkdir as mkdir19,
  readFile as readFile26,
  rename as rename12,
  writeFile as writeFile18
} from "node:fs/promises";
import { dirname as dirname13, join as join28 } from "node:path";
var FILE = "sync.json";
async function readConfig(syncDir) {
  try {
    let raw = await readFile26(join28(syncDir, FILE), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function resolveApiKey(cfg) {
  return cfg.apiKey;
}

// src/sync/default-space.ts
function parseDefaultSpaceField(value) {
  if (!Object.prototype.hasOwnProperty.call(value, "defaultSpaceId"))
    return { kind: "omitted" };
  if (value.defaultSpaceId === null) return { kind: "clear" };
  if (typeof value.defaultSpaceId == "string" && isUuid(value.defaultSpaceId))
    return { kind: "set", spaceId: value.defaultSpaceId };
  throw new Error("invalid defaultSpaceId");
}

// src/sync/token-manager.ts
var TokenMintError = class extends Error {
  constructor(status, retryable, code) {
    super(code ? `mint:${status}:${code}` : `mint:${status}`);
    this.status = status;
    this.retryable = retryable;
    this.code = code;
  }
}, UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidSpace(space) {
  if (typeof space != "object" || space === null) return !1;
  let s = space;
  return !(typeof s.space_id != "string" || !UUID_RE.test(s.space_id) || typeof s.space_name != "string" || s.space_name.length === 0 || typeof s.team_id != "string" || !UUID_RE.test(s.team_id) || typeof s.team_name != "string" || s.team_slug !== null && typeof s.team_slug != "string" || s.space_slug !== null && typeof s.space_slug != "string" || typeof s.role != "string" || s.role.trim().length === 0 || !Array.isArray(s.scopes) || !s.scopes.every(
    (sc) => sc === "space:read" || sc === "space:write"
  ) || s.scopes.includes("space:write") && !s.scopes.includes("space:read") || s.sync_state !== "active" && s.sync_state !== "paused" || s.sync_state === "paused" && s.sync_disabled_reason === null || s.sync_state === "active" && s.sync_disabled_reason !== null);
}
async function mintToken(input) {
  let f = input.fetchImpl ?? fetch, res;
  try {
    res = await f(`${input.authUrl}/api/tokens/file-sync`, {
      method: "POST",
      headers: { authorization: `Bearer ${input.apiKey}` }
    });
  } catch {
    throw new TokenMintError(0, !0);
  }
  if (res.status === 200) {
    let data = await res.json();
    if (!Array.isArray(data.spaces))
      throw new TokenMintError(200, !0);
    if (!data.spaces.every(isValidSpace))
      throw new TokenMintError(200, !0);
    let spaces = data.spaces;
    if (data.totalSpaces !== spaces.length)
      throw new TokenMintError(200, !0);
    if (data.complete !== !0)
      throw new TokenMintError(200, !0);
    if (!Number.isInteger(data.expiresIn) || data.expiresIn < 1 || data.expiresIn > 900)
      throw new TokenMintError(200, !0);
    if (spaces.some(
      (s) => s.sync_state === "active" && s.scopes.includes("space:read")
    )) {
      if (typeof data.token != "string" || data.token.length === 0 || data.tokenType !== "Bearer")
        throw new TokenMintError(200, !0, "active inventory requires token");
    } else if (data.token !== null || data.tokenType !== null)
      throw new TokenMintError(
        200,
        !0,
        "paused inventory must not include token"
      );
    let defaultSpace;
    try {
      defaultSpace = parseDefaultSpaceField(data);
    } catch {
      throw new TokenMintError(200, !0, "invalid_default_space_id");
    }
    return {
      token: data.token ?? null,
      tokenType: data.tokenType ?? null,
      expiresIn: data.expiresIn,
      complete: !0,
      totalSpaces: spaces.length,
      spaces,
      defaultSpace
    };
  }
  if (res.status === 422) {
    try {
      if ((await res.json()).error === "too_many_syncable_spaces")
        throw new TokenMintError(422, !1, "too_many_syncable_spaces");
    } catch (err) {
      if (err instanceof TokenMintError) throw err;
    }
    throw new TokenMintError(422, !1);
  }
  let retryable = res.status === 429 || res.status >= 500;
  throw new TokenMintError(res.status, retryable);
}

// src/disclosure-manifest.ts
import { createHash as createHash9 } from "node:crypto";
var sha256hex = (s) => createHash9("sha256").update(s, "utf8").digest("hex"), MANIFEST_PREFIX = "byterover.disclosure-manifest.v1", POLICY_VERSION = "2", REDACTION_ALGORITHM = {
  full: "full-v1",
  metadata: "metadata-allowlist-v2",
  redacted: "strip-bv-fact-non-public-v2"
};
function buildDisclosureManifest(fullHtml, layeredHtml, layer, issuedAt) {
  return {
    version: "1",
    // fullTopicHash is SEMANTIC — it ties the manifest to the full topic's
    // Phase 3 signature (which is over canonicalTopicHash). layerHash binds the
    // EXACT disclosed bytes, so the recipient detects any tamper (incl. id /
    // path / timestamps, which the canonical hash excludes).
    fullTopicHash: canonicalTopicHash(fullHtml),
    layerHash: sha256hex(layeredHtml),
    layer,
    policyVersion: POLICY_VERSION,
    redactionAlgorithm: REDACTION_ALGORITHM[layer],
    // Parser parity: read the signed path/id via the SAME parse5 root that
    // fullTopicHash hashes (NOT the byte scanner) — so the manifest's path/id
    // always refer to the exact <bv-topic> element the hash covers (defect class b).
    sourcePath: readCanonicalRootAttribute(fullHtml, "path") ?? "",
    sourceTopicId: readCanonicalRootAttribute(fullHtml, "id") ?? "",
    issuedAt
  };
}
function encodeManifest(m) {
  let canonical = JSON.stringify({
    version: m.version,
    fullTopicHash: m.fullTopicHash,
    layerHash: m.layerHash,
    layer: m.layer,
    policyVersion: m.policyVersion,
    redactionAlgorithm: m.redactionAlgorithm,
    sourcePath: m.sourcePath,
    sourceTopicId: m.sourceTopicId,
    issuedAt: m.issuedAt
  });
  return new TextEncoder().encode(`${MANIFEST_PREFIX}
${canonical}`);
}
function signDisclosureManifest(manifest, privateKeyPem) {
  return signDetached(privateKeyPem, encodeManifest(manifest));
}

// ../../packages/disclosure/src/topic-verify.ts
function verifyHtmlTopic(html, publicKeyPem) {
  try {
    let sig = readCanonicalRootAttribute(html, "sig"), kid = readCanonicalRootAttribute(html, "kid");
    return sig ? kid ? kid !== fingerprint(publicKeyPem) ? { ok: !1, reason: "kid-mismatch" } : verifyTopicHash(publicKeyPem, canonicalTopicHash(html), sig) ? { ok: !0 } : { ok: !1, reason: "invalid-sig" } : { ok: !1, reason: "no-kid" } : { ok: !1, reason: "no-sig" };
  } catch {
    return { ok: !1, reason: "invalid-sig" };
  }
}

// src/command-event.ts
import { randomUUID as randomUUID7 } from "node:crypto";

// src/config.ts
var SKILL_VERSION = "4.2.0", AUTH_URL = "https://v4-app.byterover.dev";
var ANALYTICS_TELEMETRY_URL = "https://v4-telemetry.byterover.dev", ANALYTICS_ENABLED = ANALYTICS_TELEMETRY_URL.length > 0, rawMaxBytes = 0, EVENT_MAX_BYTES = Number.isInteger(rawMaxBytes) && rawMaxBytes > 0 ? rawMaxBytes : 4096, rawCapabilityRefresh = "", CAPABILITY_REFRESH_ENABLED = !["0", "false", "off"].includes(
  rawCapabilityRefresh.trim().toLowerCase()
);

// src/command-event.ts
var EVENT_NAME = toFinalSkillEventName("command"), MIN_CHUNK_BYTES = 256, ROW_OVERHEAD_BYTES = 320;
function maxBytes() {
  return EVENT_MAX_BYTES;
}
async function emitCommandEvent(input) {
  try {
    for (let properties of buildEventProperties(input, maxBytes()))
      await captureAnalyticsEvent({
        name: EVENT_NAME,
        source: "skill",
        properties
      });
  } catch {
  }
}
function buildEventProperties(input, cap) {
  let effectiveCap = Math.max(MIN_CHUNK_BYTES, cap - ROW_OVERHEAD_BYTES), durationMs = Math.max(0, Math.round(input.durationMs)), agent = resolveAgent(), attribution = agent ? { agent } : {}, inline = {
    command: input.command,
    args: input.args,
    cwd: process.cwd(),
    ok: input.result.ok,
    duration_ms: durationMs,
    result: input.result,
    ...attribution
  };
  if (byteLen(inline) <= effectiveCap) return [inline];
  let groupId = randomUUID7(), metaTemplate = {
    command: input.command,
    cwd: process.cwd(),
    ok: input.result.ok,
    duration_ms: durationMs,
    group_id: groupId,
    chunk_index: 0,
    chunk_total: 0,
    chunk: "",
    ...attribution
  }, overhead = byteLen({
    ...metaTemplate,
    chunk_index: 999999,
    chunk_total: 999999
  }), budget = Math.max(MIN_CHUNK_BYTES, effectiveCap - overhead), heavy = JSON.stringify({ args: input.args, result: input.result }), pieces = chunkByBytes(heavy, budget);
  return pieces.map((chunk2, i) => ({
    command: input.command,
    cwd: process.cwd(),
    ok: input.result.ok,
    duration_ms: durationMs,
    group_id: groupId,
    chunk_index: i,
    chunk_total: pieces.length,
    chunk: chunk2,
    ...attribution
  }));
}
function chunkByBytes(str3, maxBytes2) {
  let pieces = [], current = "", currentBytes = 0;
  for (let cp of str3) {
    let cpBytes = Buffer.byteLength(cp, "utf8");
    currentBytes + cpBytes > maxBytes2 && current.length > 0 && (pieces.push(current), current = "", currentBytes = 0), current += cp, currentBytes += cpBytes;
  }
  return current.length > 0 && pieces.push(current), pieces.length > 0 ? pieces : [""];
}
function byteLen(v) {
  return Buffer.byteLength(JSON.stringify(v), "utf8");
}

// src/commands.ts
function parseArgs(args) {
  let positionals = [], flags = {};
  for (let i = 0; i < args.length; i++) {
    let arg = args[i];
    if (arg.startsWith("--")) {
      let key = arg.slice(2), next = args[i + 1];
      next === void 0 || next.startsWith("--") ? flags[key] = !0 : (flags[key] = next, i++);
    } else
      positionals.push(arg);
  }
  return { positionals, flags };
}
function str2(value) {
  return typeof value == "string" ? value : void 0;
}
var projectPathHash2 = projectPathHash;
async function projectHashForRoot(root) {
  let resolvedRoot = resolve10(root);
  try {
    let entries = await listProjectHistory(), canonicalCwd = resolve10(process.cwd()), bestProject, bestLen = -1;
    for (let entry of entries) {
      let ep = resolve10(entry.project);
      (canonicalCwd === ep || canonicalCwd.startsWith(ep + sep7)) && ep.length > bestLen && (bestProject = ep, bestLen = ep.length);
    }
    if (bestProject !== void 0) return projectPathHash2(bestProject);
    let space_id = spaceIdFromContextTreeRoot(resolvedRoot);
    if (space_id !== null) {
      let bindings = await readBindings(), owner = pickMostRecentBindingForSpace(bindings, space_id);
      if (owner !== null) return projectPathHash2(owner.folder);
    }
  } catch {
  }
  return projectPathHash2(resolvedRoot);
}
async function spaceAttributionForRoot(root) {
  let space_id = spaceIdFromContextTreeRoot(resolve10(root));
  if (space_id === null) return {};
  try {
    let meta = await readSpaceMetadata(join29(getProjectsDir(), space_id));
    return {
      space_id,
      ...meta?.team_id ? { team_id: meta.team_id } : {}
    };
  } catch {
    return { space_id };
  }
}
function spaceIdFromContextTreeRoot(root) {
  if (basename5(root) !== "context-tree") return null;
  let candidate = basename5(dirname14(root));
  return isUuid(candidate) ? candidate : null;
}
function pickMostRecentBindingForSpace(bindings, space_id) {
  let best = null;
  for (let b of bindings)
    b.removedAt === void 0 && b.space_id === space_id && (best === null || b.addedAt > best.addedAt) && (best = b);
  return best;
}
async function findSpaceIdByDisplayName(displayName) {
  let entries = [];
  try {
    entries = await readdir8(getProjectsDir());
  } catch {
    return null;
  }
  for (let name of entries)
    if (isUuid(name))
      try {
        let meta = await readSpaceMetadata(join29(getProjectsDir(), name));
        if (meta !== null && meta.space_name === displayName)
          return meta.space_id;
      } catch {
      }
  return null;
}
var AGENT_ATTRIBUTED_EVENTS = /* @__PURE__ */ new Set([
  AnalyticsEventNames.RECORD_RUN_COMPLETED,
  AnalyticsEventNames.QUERY_COMPLETED,
  AnalyticsEventNames.DREAM_COMPLETED,
  AnalyticsEventNames.READ_COMPLETED
]), AGENT_ID_EVENTS = /* @__PURE__ */ new Set([
  AnalyticsEventNames.RECORD_RUN_COMPLETED,
  AnalyticsEventNames.QUERY_COMPLETED,
  AnalyticsEventNames.DREAM_COMPLETED,
  AnalyticsEventNames.READ_COMPLETED
]);
async function emit2(input) {
  try {
    let properties = {
      ...input.properties
    };
    if (AGENT_ATTRIBUTED_EVENTS.has(input.name)) {
      let agent = resolveAgent();
      properties.agent = agent, AGENT_ID_EVENTS.has(input.name) && (properties.agent_id = agent);
    }
    if (input.name === AnalyticsEventNames.RECORD_RUN_COMPLETED) {
      let added = Number(properties.operations_added ?? 0), updated = Number(properties.operations_updated ?? 0), merged = Number(properties.operations_merged ?? 0);
      properties.memory_write_succeeded = added > 0 || updated > 0 || merged > 0;
    }
    await appendAnalyticsRecord({
      name: input.name,
      properties
    });
  } catch {
  }
}
function parseCsv(value) {
  return value ? value.split(",").map((s) => s.trim()).filter((s) => s.length > 0) : [];
}
async function topicMetadata(root, relPath) {
  try {
    let t = await readTopic(root, relPath);
    return {
      tags: parseCsv(t.attributes.tags),
      keywords: parseCsv(t.attributes.keywords),
      related: parseCsv(t.attributes.related)
    };
  } catch {
    return { tags: [], keywords: [], related: [] };
  }
}
async function citationEvidence(root, relPath) {
  let [signal, topic] = await Promise.allSettled([
    getSignal(root, relPath),
    readTopic(root, relPath)
  ]), evidence = {};
  if (signal.status === "fulfilled" && signal.value !== void 0 && (evidence.accessCount = signal.value.accessCount), topic.status === "fulfilled") {
    let { updatedat, updatedby } = topic.value.attributes;
    typeof updatedat == "string" && updatedat.length > 0 && (evidence.updatedAt = updatedat), typeof updatedby == "string" && updatedby.length > 0 && (evidence.updatedBy = updatedby);
  }
  return evidence;
}
var CITATION_EVIDENCE_CAP = 10;
async function citationHits(hits, fallbackRoot) {
  let head = hits.slice(0, CITATION_EVIDENCE_CAP);
  return [...await Promise.all(
    head.map(async (hit) => {
      let root = hit.root ?? fallbackRoot;
      if (root === null) return hit;
      let evidence = await citationEvidence(root, hit.path);
      return { ...hit, ...evidence };
    })
  ), ...hits.slice(CITATION_EVIDENCE_CAP)];
}
var CONTEXT_TREE_PREFIX = ".brv/context-tree/";
function knowledgePath(relOrPath) {
  return relOrPath.replace(/\.html$/i, "");
}
async function recordDeleteIntentBestEffort(root, prefix) {
  try {
    let syncDir = syncStateDirForContextTreeRoot(root);
    await recordDeleteIntent({ syncDir, prefix });
  } catch (err) {
    console.error(
      "[skill] recording delete-intent failed (ignored)",
      err
    );
  }
}
function spaceIdFromRoot(root) {
  let parent = basename5(dirname14(root));
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    parent
  ))
    return parent;
}
function resolveWebBaseUrl() {
  try {
    let portPath = join29(getGlobalDataDir(), "bridge-port.txt"), raw = readFileSync2(portPath, "utf8").trim();
    if (/^\d+$/.test(raw)) {
      let port = Number(raw);
      if (port > 0 && port < 65536) return `http://127.0.0.1:${port}`;
    }
  } catch {
  }
  return null;
}
async function safeReconcile(root, event) {
  try {
    await new Reconciler(root).afterMutation(event);
  } catch (err) {
    console.error(
      `reconciler.afterMutation(${event.kind}, ${event.path}) failed:`,
      err instanceof Error ? err.message : err
    );
  }
}
async function topicTags(root, relPath) {
  try {
    return existsSync4(resolveWithinTree(root, relPath)) ? (await readTopic(root, relPath)).elements.map((e) => e.tag) : [];
  } catch {
    return [];
  }
}
function canonicalRel(topicPath) {
  let normalized = topicPath.replaceAll("\\", "/");
  if (normalized.startsWith("/"))
    throw new Error(
      `absolute paths are not allowed: "${topicPath}" \u2014 use a tree-relative topic path`
    );
  let segments = normalized.replace(/\.html$/i, "").split("/").filter((s) => s.length > 0);
  if (segments.some((s) => s === ".."))
    throw new Error(`path traversal ("..") is not allowed: "${topicPath}"`);
  return `${segments.join("/")}.html`;
}
function topicPathFromHtml(html) {
  for (let el of walkElements(parseHtml(html)))
    if (el.tagName === "bv-topic") return el.attributes.path;
}
function rewriteTopicPath(html, newPath) {
  let escaped = newPath.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"), re = /(<bv-topic\b[^>]*?\bpath=)(["'])([^"']*)\2/i;
  if (re.test(html))
    return html.replace(re, `$1"${escaped}"`);
}
async function rootFromSpaceFlag(flags) {
  let spaceFlag = str2(flags.space);
  return spaceFlag === void 0 ? null : resolveSpaceFlag(spaceFlag);
}
async function resolveSpaceFlag(value) {
  validateSpaceDisplayName(value);
  let space_id = await findSpaceIdByDisplayName(value);
  if (space_id === null)
    throw new Error(
      `No space named "${value}" found. Run \`space list\` to see available spaces.`
    );
  let deletion = await isSpaceDeleted(space_id);
  if (deletion.deleted)
    throw new SpaceDeletedError(space_id, deletion.hard);
  let root = spaceContextTreePath(space_id);
  if (!await pathExists(root))
    throw new Error(
      `Space "${value}" exists but its context tree was not found at ${root}.`
    );
  return root;
}
async function rootFrom(flags) {
  let explicit = str2(flags.root);
  if (explicit) return explicit;
  let bySpace = await rootFromSpaceFlag(flags);
  return bySpace || resolveContextRoot();
}
async function rootFromExplicitFlag(flags) {
  return str2(flags.root) ?? null;
}
function commandError(code, error) {
  return { ok: !1, code, error };
}
function isTerminalCloudNotReadyReason(reason) {
  return reason === "auth_expired" || reason === "capability_expired";
}
function cloudNotReadyCommandError(reason) {
  return reason === "auth_expired" ? commandError(
    "cloud-auth-expired",
    "Cloud session expired. Re-authenticate in the desktop to sync."
  ) : reason === "capability_expired" ? commandError(
    "cloud-capability-expired",
    "Cloud sync capability expired."
  ) : commandError("cloud-not-ready", "Cloud space is not ready yet.");
}
async function localContextRootForRecord() {
  try {
    return { kind: "root", root: await resolveContextRoot() };
  } catch (err) {
    if (err instanceof NoDefaultSpaceError)
      return {
        kind: "error",
        result: { ok: !1, code: "no-default", error: err.message }
      };
    throw err;
  }
}
async function localContextRootForQuery() {
  try {
    return { kind: "single", root: await resolveContextRoot() };
  } catch (err) {
    if (err instanceof NoDefaultSpaceError)
      return {
        kind: "error",
        result: { ok: !1, code: "no-default", error: err.message }
      };
    throw err;
  }
}
async function rootForRecord(flags) {
  let explicit = await rootFromExplicitFlag(flags);
  if (explicit) return { kind: "root", root: explicit };
  let bySpace = await rootFromSpaceFlag(flags);
  if (bySpace) return { kind: "root", root: bySpace };
  let projectsRoot = getProjectsDir(), resolved = await resolveCloudBoundRoot({
    cwd: process.cwd(),
    projectsRoot
  });
  if (resolved.kind === "bound")
    return resolved.can_write ? { kind: "root", root: resolved.root } : {
      kind: "error",
      result: commandError(
        "cloud-read-only",
        "Cloud space is read-only for this API key."
      )
    };
  if (resolved.kind === "not_ready") {
    if (isTerminalCloudNotReadyReason(resolved.reason))
      return {
        kind: "error",
        result: cloudNotReadyCommandError(resolved.reason)
      };
    if (!await awaitBaselineReady(
      cloudSpaceDir(projectsRoot, resolved.space_id),
      { timeout_ms: 5e3 }
    )) {
      let latest = await resolveCloudBoundRoot({
        cwd: process.cwd(),
        projectsRoot
      }), reason = latest.kind === "not_ready" ? latest.reason : resolved.reason;
      return {
        kind: "error",
        result: cloudNotReadyCommandError(reason)
      };
    }
    return rootForRecord(flags);
  }
  return resolved.kind === "invalid" ? {
    kind: "error",
    result: commandError(
      "cloud-status-unavailable",
      `Cloud space status is invalid: ${resolved.reason}`
    )
  } : resolved.kind === "deleted" ? {
    kind: "error",
    result: commandError(
      "space-deleted",
      `Space ${resolved.space_id} is deleted.`
    )
  } : localContextRootForRecord();
}
async function rootsForQuery(flags) {
  let explicit = await rootFromExplicitFlag(flags);
  if (explicit) return { kind: "single", root: explicit };
  let bySpace = await rootFromSpaceFlag(flags);
  if (bySpace) return { kind: "single", root: bySpace };
  let projectsRoot = getProjectsDir(), resolved = await resolveCloudBoundRoot({
    cwd: process.cwd(),
    projectsRoot
  });
  if (resolved.kind === "bound")
    return resolved.can_read ? { kind: "single", root: resolved.root } : {
      kind: "error",
      result: commandError(
        "cloud-read-unavailable",
        "Cloud space is not readable for this API key."
      )
    };
  if (resolved.kind === "not_ready") {
    if (isTerminalCloudNotReadyReason(resolved.reason))
      return {
        kind: "error",
        result: cloudNotReadyCommandError(resolved.reason)
      };
    if (!await awaitBaselineReady(
      cloudSpaceDir(projectsRoot, resolved.space_id),
      { timeout_ms: 5e3 }
    )) {
      let latest = await resolveCloudBoundRoot({
        cwd: process.cwd(),
        projectsRoot
      }), reason = latest.kind === "not_ready" ? latest.reason : resolved.reason;
      return {
        kind: "error",
        result: cloudNotReadyCommandError(reason)
      };
    }
    return rootsForQuery(flags);
  }
  if (resolved.kind === "invalid")
    return {
      kind: "error",
      result: commandError(
        "cloud-status-unavailable",
        `Cloud space status is invalid: ${resolved.reason}`
      )
    };
  if (resolved.kind === "deleted")
    return {
      kind: "error",
      result: commandError(
        "space-deleted",
        `Space ${resolved.space_id} is deleted.`
      )
    };
  if (resolved.kind === "local")
    return localContextRootForQuery();
  if (await readDaemonAuth(daemonAuthPath(projectsRoot)) !== null) {
    let roots = await listQueryableCloudRoots(projectsRoot);
    if (roots.length > 0) return { kind: "aggregate", roots };
  }
  return localContextRootForQuery();
}
async function legacyGuard(root) {
  let status = await needsMigration(root);
  if (status.needsMigration)
    return {
      ok: !1,
      error: `This .brv tree has ${status.legacyMd.length} legacy markdown file(s) the HTML engine cannot read. Run \`migrate\` first.`
    };
}
function escapeText5(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function buildTopicHtml(path2, flags, positionals) {
  let title = str2(flags.title) ?? path2, summary = str2(flags.summary), keywords = str2(flags.keywords), tags = str2(flags.tags), related = str2(flags.related), body = str2(flags.body) ?? positionals.slice(1).join(" "), attrs = [
    `path="${escapeHtmlAttributeValue(path2)}"`,
    `title="${escapeHtmlAttributeValue(title)}"`
  ];
  return summary && attrs.push(`summary="${escapeHtmlAttributeValue(summary)}"`), keywords && attrs.push(`keywords="${escapeHtmlAttributeValue(keywords)}"`), tags && attrs.push(`tags="${escapeHtmlAttributeValue(tags)}"`), related && attrs.push(`related="${escapeHtmlAttributeValue(related)}"`), `<bv-topic ${attrs.join(" ")}><bv-fact>${escapeText5(body)}</bv-fact></bv-topic>`;
}
async function runCommand(name, argv) {
  let { positionals, flags } = parseArgs(argv);
  switch (name) {
    case "record": {
      let startedAt = Date.now(), taskId = randomUUID8();
      if (flags.batch === !0) {
        let inputPath = str2(flags.input);
        if (!inputPath)
          return {
            ok: !1,
            error: "record --batch requires --input <ndjson-file>"
          };
        let resolvedRoot2 = await rootForRecord(flags);
        if (resolvedRoot2.kind === "error") return resolvedRoot2.result;
        let root2 = resolvedRoot2.root, signer2 = await buildTopicSignerForRoot(root2), lines;
        try {
          lines = (await readFile27(inputPath, "utf8")).split(`
`).map((l) => l.trim()).filter((l) => l.length > 0);
        } catch (err) {
          return {
            ok: !1,
            error: `record --batch: failed to read --input "${inputPath}": ${err instanceof Error ? err.message : String(err)}`
          };
        }
        let written = [], failed = [], reconcileEvents = [], writtenAny = !1;
        for (let i = 0; i < lines.length; i++) {
          let line = lines[i], spec;
          try {
            let parsed = JSON.parse(line);
            if (typeof parsed != "object" || parsed === null || typeof parsed.path != "string" || typeof parsed.html != "string") {
              failed.push({
                path: null,
                error: `line ${i + 1}: missing required "path" or "html" string`
              });
              continue;
            }
            spec = parsed;
          } catch (err) {
            failed.push({
              path: null,
              error: `line ${i + 1}: malformed JSON (${err instanceof Error ? err.message : String(err)})`
            });
            continue;
          }
          let result2 = await writeTopic(root2, {
            agent: resolveAgent(),
            confirmOverwrite: spec.overwrite === !0,
            rawHtml: spec.html,
            signer: signer2
          });
          if (!result2.ok) {
            failed.push({
              path: spec.path,
              error: result2.errors.map((e) => e.message).join("; ")
            });
            continue;
          }
          writtenAny = !0, result2.created ? await updateSignal(
            root2,
            result2.relPath,
            () => createDefaultRuntimeSignals()
          ) : await recordCurateUpdateSignal(root2, result2.relPath), written.push({
            path: result2.relPath,
            created: result2.created,
            warnings: [...result2.warnings]
          }), reconcileEvents.push({
            kind: result2.created ? "create" : "rewrite",
            path: result2.relPath
          });
        }
        if (writtenAny) {
          await rebuildManifest(root2), await rebuildIndex(root2, { now: (/* @__PURE__ */ new Date()).toISOString() });
          for (let evt of reconcileEvents)
            await safeReconcile(root2, {
              kind: evt.kind,
              path: evt.path,
              source: "skill"
            });
        }
        return await emit2({
          name: AnalyticsEventNames.RECORD_RUN_COMPLETED,
          properties: {
            duration_ms: Date.now() - startedAt,
            operations_added: written.filter((w) => w.created).length,
            operations_deleted: 0,
            operations_failed: failed.length,
            operations_merged: 0,
            operations_updated: written.filter((w) => !w.created).length,
            outcome: failed.length === 0 ? "completed" : "error",
            pending_review_count: 0,
            project_path_hash: await projectHashForRoot(root2),
            ...await spaceAttributionForRoot(root2),
            task_id: taskId,
            task_type: TASK_TYPE.RECORD
          }
        }), {
          ok: failed.length === 0,
          data: {
            written,
            failed,
            total: lines.length,
            durationMs: Date.now() - startedAt
          }
        };
      }
      let path2 = positionals[0];
      if (!path2) return { ok: !1, error: "record requires a topic path" };
      let resolvedRoot = await rootForRecord(flags);
      if (resolvedRoot.kind === "error") return resolvedRoot.result;
      let root = resolvedRoot.root, rawHtml = str2(flags.html) ?? buildTopicHtml(path2, flags, positionals), targetRel = canonicalRel(topicPathFromHtml(rawHtml) ?? path2), oldTags = await topicTags(root, targetRel), signer = await buildTopicSignerForRoot(root), result = await writeTopic(root, {
        agent: resolveAgent(),
        confirmOverwrite: flags.overwrite === !0,
        rawHtml,
        signer
      });
      if (!result.ok)
        return await emit2({
          name: AnalyticsEventNames.RECORD_RUN_COMPLETED,
          properties: {
            duration_ms: Date.now() - startedAt,
            operations_added: 0,
            operations_deleted: 0,
            operations_failed: 1,
            operations_merged: 0,
            operations_updated: 0,
            outcome: "error",
            pending_review_count: 0,
            project_path_hash: await projectHashForRoot(root),
            ...await spaceAttributionForRoot(root),
            task_id: taskId,
            task_type: TASK_TYPE.RECORD
          }
        }), {
          ok: !1,
          error: result.errors.map((e) => e.message).join("; ")
        };
      result.created ? await updateSignal(
        root,
        result.relPath,
        () => createDefaultRuntimeSignals()
      ) : await recordCurateUpdateSignal(root, result.relPath);
      let warnings = [...result.warnings];
      if (!result.created) {
        let newTags = new Set(await topicTags(root, result.relPath)), lost = [...new Set(oldTags)].filter((t) => !newTags.has(t));
        lost.length > 0 && warnings.push(
          `structural-loss: overwrite dropped element type(s) ${lost.join(", ")} present in the previous version`
        );
      }
      await rebuildManifest(root), await rebuildIndex(root, { now: (/* @__PURE__ */ new Date()).toISOString() }), await safeReconcile(root, {
        kind: result.created ? "create" : "rewrite",
        path: result.relPath,
        source: "skill"
      });
      let meta = await topicMetadata(root, result.relPath);
      return await emit2({
        name: AnalyticsEventNames.RECORD_RUN_COMPLETED,
        properties: {
          duration_ms: Date.now() - startedAt,
          keywords: meta.keywords,
          knowledge_path: knowledgePath(result.relPath),
          operations_added: result.created ? 1 : 0,
          operations_deleted: 0,
          operations_failed: 0,
          operations_merged: 0,
          operations_updated: result.created ? 0 : 1,
          outcome: "completed",
          pending_review_count: 0,
          project_path_hash: await projectHashForRoot(root),
          ...await spaceAttributionForRoot(root),
          tags: meta.tags,
          task_id: taskId,
          task_type: TASK_TYPE.RECORD
        }
      }), {
        ok: !0,
        // Return the tree-relative path, not the absolute filesystem
        // location: the agent never needs the host path, and leaking it
        // on success would hand back everything SKILL.md no longer
        // documents.
        data: { created: result.created, path: result.relPath, warnings }
      };
    }
    case "prune": {
      let startedAt = Date.now(), taskId = randomUUID8(), paths = positionals.filter((p) => !!p);
      if (paths.length === 0)
        return {
          ok: !1,
          error: "prune requires at least one topic path"
        };
      let resolvedRoot = await rootForRecord(flags);
      if (resolvedRoot.kind === "error") return resolvedRoot.result;
      let root = resolvedRoot.root, blocked = await legacyGuard(root);
      if (blocked) return blocked;
      let pruned = [], preservedSignals = [], firstMetaBefore = paths.length === 1 ? await topicMetadata(root, canonicalRel(paths[0])) : void 0;
      for (let i = 0; i < paths.length; i++) {
        let path2 = paths[i], rel = canonicalRel(path2), signalBefore = await getSignal(root, rel);
        await recordDeleteIntentBestEffort(root, rel);
        let result = await applyDelete(root, path2);
        if (!result.ok)
          return await emit2({
            name: AnalyticsEventNames.RECORD_RUN_COMPLETED,
            properties: {
              duration_ms: Date.now() - startedAt,
              knowledge_path: knowledgePath(path2),
              operations_added: 0,
              operations_deleted: pruned.length,
              operations_failed: 1,
              operations_merged: 0,
              operations_updated: 0,
              outcome: "error",
              pending_review_count: 0,
              project_path_hash: await projectHashForRoot(root),
              ...await spaceAttributionForRoot(root),
              task_id: taskId,
              task_type: TASK_TYPE.RECORD
            }
          }), {
            ok: !1,
            error: `no topic to prune at "${path2}" (aborted after ${pruned.length} of ${paths.length})`,
            data: {
              pruned: pruned.map((p) => p.path),
              failed: path2,
              skipped: paths.slice(i + 1)
            }
          };
        pruned.push({ path: path2, result }), preservedSignals.push({ rel, signal: signalBefore });
      }
      await rebuildManifest(root), await rebuildIndex(root, { now: (/* @__PURE__ */ new Date()).toISOString() });
      for (let { rel, signal } of preservedSignals)
        await safeReconcile(root, {
          kind: "delete",
          path: rel,
          preservedSignal: signal,
          source: "skill"
        });
      let successProps = {
        duration_ms: Date.now() - startedAt,
        operations_added: 0,
        operations_deleted: pruned.length,
        operations_failed: 0,
        operations_merged: 0,
        operations_updated: 0,
        outcome: "completed",
        pending_review_count: 0,
        project_path_hash: await projectHashForRoot(root),
        ...await spaceAttributionForRoot(root),
        task_id: taskId,
        task_type: TASK_TYPE.RECORD
      };
      return paths.length === 1 && firstMetaBefore && (successProps.knowledge_path = knowledgePath(paths[0]), successProps.keywords = firstMetaBefore.keywords, successProps.tags = firstMetaBefore.tags), await emit2({
        name: AnalyticsEventNames.RECORD_RUN_COMPLETED,
        properties: successProps
      }), {
        ok: !0,
        data: {
          pruned: pruned.map(({ path: path2, result }) => ({
            path: path2,
            deleted: result.deleted
          }))
        }
      };
    }
    case "synthesize": {
      let startedAt = Date.now(), taskId = randomUUID8(), newPath = positionals[0];
      if (!newPath)
        return {
          ok: !1,
          error: "synthesize requires a new topic path"
        };
      let absorbFlag = str2(flags.absorb);
      if (!absorbFlag)
        return {
          ok: !1,
          error: "synthesize requires --absorb <path1,path2,...>"
        };
      let absorbPaths = absorbFlag.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
      if (absorbPaths.length === 0)
        return {
          ok: !1,
          error: "synthesize --absorb cannot be empty"
        };
      let resolvedRoot = await rootForRecord(flags);
      if (resolvedRoot.kind === "error") return resolvedRoot.result;
      let root = resolvedRoot.root, blocked = await legacyGuard(root);
      if (blocked) return blocked;
      let newCanon = canonicalRel(newPath);
      if (absorbPaths.filter(
        (p) => canonicalRel(p) === newCanon
      ).length > 0)
        return {
          ok: !1,
          error: `synthesize new-path "${newPath}" cannot appear in --absorb`
        };
      let rawHtml = str2(flags.html) ?? buildTopicHtml(newPath, flags, [newPath]), writeResult = await writeTopic(root, {
        agent: resolveAgent(),
        confirmOverwrite: flags.overwrite === !0,
        rawHtml
      });
      if (!writeResult.ok)
        return await emit2({
          name: AnalyticsEventNames.RECORD_RUN_COMPLETED,
          properties: {
            duration_ms: Date.now() - startedAt,
            knowledge_path: knowledgePath(newPath),
            operations_added: 0,
            operations_deleted: 0,
            operations_failed: 1,
            operations_merged: 0,
            operations_updated: 0,
            outcome: "error",
            pending_review_count: 0,
            project_path_hash: await projectHashForRoot(root),
            ...await spaceAttributionForRoot(root),
            task_id: taskId,
            task_type: TASK_TYPE.RECORD
          }
        }), {
          ok: !1,
          error: writeResult.errors.map((e) => e.message).join("; ")
        };
      writeResult.created ? await updateSignal(
        root,
        writeResult.relPath,
        () => createDefaultRuntimeSignals()
      ) : await recordCurateUpdateSignal(root, writeResult.relPath);
      let absorbed = [], reconcileEvents = [];
      for (let i = 0; i < absorbPaths.length; i++) {
        let path2 = absorbPaths[i], loserRel = canonicalRel(path2), signalBefore = await getSignal(root, loserRel);
        await recordDeleteIntentBestEffort(root, loserRel);
        let result = await applyDelete(root, path2);
        if (!result.ok)
          return await emit2({
            name: AnalyticsEventNames.RECORD_RUN_COMPLETED,
            properties: {
              duration_ms: Date.now() - startedAt,
              knowledge_path: knowledgePath(newPath),
              operations_added: writeResult.created ? 1 : 0,
              operations_deleted: absorbed.length,
              operations_failed: 1,
              operations_merged: 0,
              operations_updated: writeResult.created ? 0 : 1,
              outcome: "error",
              pending_review_count: 0,
              project_path_hash: await projectHashForRoot(root),
              ...await spaceAttributionForRoot(root),
              task_id: taskId,
              task_type: TASK_TYPE.RECORD
            }
          }), {
            ok: !1,
            error: `no topic to absorb at "${path2}" (synthesized topic was written; aborted after absorbing ${absorbed.length} of ${absorbPaths.length})`,
            data: {
              created: writeResult.created,
              path: writeResult.relPath,
              absorbed: absorbed.map((a) => a.path),
              failed: path2,
              skipped: absorbPaths.slice(i + 1)
            }
          };
        absorbed.push({ path: path2, result }), reconcileEvents.push({ loserRel, signal: signalBefore });
      }
      await rebuildManifest(root), await rebuildIndex(root, { now: (/* @__PURE__ */ new Date()).toISOString() });
      let survivorRel = writeResult.relPath;
      for (let { loserRel } of reconcileEvents)
        await safeReconcile(root, {
          kind: "merge",
          path: survivorRel,
          survivorPath: survivorRel,
          loserPath: loserRel,
          source: "skill"
        });
      let meta = await topicMetadata(root, writeResult.relPath);
      return await emit2({
        name: AnalyticsEventNames.RECORD_RUN_COMPLETED,
        properties: {
          duration_ms: Date.now() - startedAt,
          keywords: meta.keywords,
          knowledge_path: knowledgePath(writeResult.relPath),
          operations_added: writeResult.created ? 1 : 0,
          operations_deleted: absorbed.length,
          operations_failed: 0,
          operations_merged: 0,
          operations_updated: writeResult.created ? 0 : 1,
          outcome: "completed",
          pending_review_count: 0,
          project_path_hash: await projectHashForRoot(root),
          ...await spaceAttributionForRoot(root),
          tags: meta.tags,
          task_id: taskId,
          task_type: TASK_TYPE.RECORD
        }
      }), {
        ok: !0,
        data: {
          created: writeResult.created,
          path: writeResult.relPath,
          absorbed: absorbed.map(({ path: path2, result }) => ({
            path: path2,
            deleted: result.deleted
          }))
        }
      };
    }
    case "move": {
      let startedAt = Date.now(), taskId = randomUUID8(), topicPath = positionals[0], toPathFlag = str2(flags["to-path"]), fromSpaceFlag = str2(flags["from-space"]), toSpaceFlag = str2(flags["to-space"]);
      if (!topicPath)
        return {
          ok: !1,
          error: "move requires a <topic-path> positional"
        };
      if (toPathFlag !== void 0) {
        if (fromSpaceFlag !== void 0 || toSpaceFlag !== void 0)
          return {
            ok: !1,
            error: "move accepts either --to-path (in-space) OR --from-space + --to-space (cross-space), not both"
          };
        let resolvedRoot = await rootForRecord(flags);
        if (resolvedRoot.kind === "error") return resolvedRoot.result;
        let root = resolvedRoot.root, blocked = await legacyGuard(root);
        if (blocked) return blocked;
        let sourceRel = canonicalRel(topicPath), targetRel = canonicalRel(toPathFlag);
        if (sourceRel === targetRel)
          return {
            ok: !1,
            error: `move source and destination paths are the same; nothing to do ("${sourceRel}")`
          };
        let moveWriteContext = await classifyMoveWriteContext(root);
        if (moveWriteContext.kind === "not-ready")
          return {
            ok: !1,
            error: "cannot move synced topic safely: sync is not ready; sign in and retry"
          };
        if (moveWriteContext.kind === "synced" && flags.overwrite === !0)
          return {
            ok: !1,
            error: "cannot move synced topic safely: --overwrite is not supported for synced moves"
          };
        let sourceAbs = resolveWithinTree(root, sourceRel), sourceHtml2;
        try {
          sourceHtml2 = await readFile27(sourceAbs, "utf8");
        } catch {
          return {
            ok: !1,
            error: `no topic to move at "${topicPath}"`
          };
        }
        let sourceSignal2 = await getSignal(root, sourceRel), danglingRefs2 = [], siblings2 = (await listTopics(root)).filter(
          (p) => p !== sourceRel && p !== targetRel
        );
        for (let sib of siblings2)
          try {
            let sibAbs = resolveWithinTree(root, sib), sibHtml = await readFile27(sibAbs, "utf8"), related = readTopicRootAttribute(sibHtml, "related");
            parseRelatedAttr(related).some((ref) => refTargets(ref, sourceRel)) && danglingRefs2.push(sib);
          } catch {
          }
        let syncedSourceId, syncedBaseline;
        if (moveWriteContext.kind === "synced" && (syncedSourceId = readTopicRootAttribute(sourceHtml2, "id"), syncedBaseline = await new SyncState(
          moveWriteContext.syncDir
        ).getBaseline()), moveWriteContext.kind === "synced") {
          let preflight = await validateMoveIntentForLocalRename({
            syncDir: moveWriteContext.syncDir,
            authContext: moveWriteContext.authContext,
            from: sourceRel,
            to: targetRel,
            topicIdentity: syncedSourceId,
            sourceBaseline: syncedBaseline?.[sourceRel],
            destination: {
              policy: "must-be-absent",
              readState: async () => ({
                exists: existsSync4(resolveWithinTree(root, targetRel))
              })
            }
          });
          if (!preflight.ok)
            return { ok: !1, error: moveFailureMessage(preflight.reason) };
        }
        let newKnowledgePath = knowledgePath(targetRel), rewrittenHtml = rewriteTopicPath(sourceHtml2, newKnowledgePath);
        if (rewrittenHtml === void 0)
          return {
            ok: !1,
            error: `source topic at "${topicPath}" has no <bv-topic path="\u2026"> attribute to rewrite`
          };
        let writeResult2 = await writeTopic(root, {
          agent: resolveAgent(),
          confirmOverwrite: flags.overwrite === !0,
          rawHtml: rewrittenHtml
        });
        if (!writeResult2.ok)
          return await emit2({
            name: AnalyticsEventNames.RECORD_RUN_COMPLETED,
            properties: {
              duration_ms: Date.now() - startedAt,
              knowledge_path: knowledgePath(topicPath),
              operations_added: 0,
              operations_deleted: 0,
              operations_failed: 1,
              operations_merged: 0,
              operations_updated: 0,
              outcome: "error",
              pending_review_count: 0,
              project_path_hash: await projectHashForRoot(root),
              ...await spaceAttributionForRoot(root),
              task_id: taskId,
              task_type: TASK_TYPE.RECORD
            }
          }), {
            ok: !1,
            error: writeResult2.errors.map((e) => e.message).join("; ")
          };
        if (sourceSignal2 ? await updateSignal(root, writeResult2.relPath, () => sourceSignal2) : await updateSignal(
          root,
          writeResult2.relPath,
          () => createDefaultRuntimeSignals()
        ), moveWriteContext.kind === "synced") {
          let prepared = await prepareMoveIntentForLocalRename({
            syncDir: moveWriteContext.syncDir,
            authContext: moveWriteContext.authContext,
            from: sourceRel,
            to: writeResult2.relPath,
            topicIdentity: syncedSourceId,
            sourceBaseline: syncedBaseline?.[sourceRel],
            destination: {
              policy: "must-match-topic-identity",
              readState: async () => ({
                exists: existsSync4(
                  resolveWithinTree(root, writeResult2.relPath)
                ),
                identity: readTopicRootAttribute(
                  await readFile27(
                    resolveWithinTree(root, writeResult2.relPath),
                    "utf8"
                  ),
                  "id"
                )
              })
            }
          });
          if (!prepared.ok)
            return await applyDelete(root, writeResult2.relPath).catch(() => {
            }), await deleteSignal(root, writeResult2.relPath).catch(
              () => {
              }
            ), await rebuildManifest(root).catch(() => {
            }), await rebuildIndex(root, { now: (/* @__PURE__ */ new Date()).toISOString() }).catch(
              () => {
              }
            ), { ok: !1, error: moveFailureMessage(prepared.reason) };
        }
        if (!(await applyDelete(root, topicPath)).ok)
          return await emit2({
            name: AnalyticsEventNames.RECORD_RUN_COMPLETED,
            properties: {
              duration_ms: Date.now() - startedAt,
              knowledge_path: knowledgePath(writeResult2.relPath),
              operations_added: writeResult2.created ? 1 : 0,
              operations_deleted: 0,
              operations_failed: 1,
              operations_merged: 0,
              operations_updated: writeResult2.created ? 0 : 1,
              outcome: "error",
              pending_review_count: 0,
              project_path_hash: await projectHashForRoot(root),
              ...await spaceAttributionForRoot(root),
              task_id: taskId,
              task_type: TASK_TYPE.RECORD
            }
          }), {
            ok: !1,
            error: `move wrote destination "${writeResult2.relPath}" but could not remove source "${sourceRel}"`,
            data: {
              from_path: sourceRel,
              to_path: writeResult2.relPath,
              dangling_refs: danglingRefs2
            }
          };
        let now2 = (/* @__PURE__ */ new Date()).toISOString();
        await rebuildManifest(root), await rebuildIndex(root, { now: now2 });
        let sourceId = readTopicRootAttribute(sourceHtml2, "id") ?? sourceRel;
        await safeReconcile(root, {
          kind: "rename",
          path: sourceRel,
          newPath: writeResult2.relPath,
          preservedSignal: sourceSignal2,
          source: "skill",
          topicIdentity: sourceId
        });
        let meta2 = await topicMetadata(root, writeResult2.relPath);
        return await emit2({
          name: AnalyticsEventNames.RECORD_RUN_COMPLETED,
          properties: {
            duration_ms: Date.now() - startedAt,
            keywords: meta2.keywords,
            knowledge_path: knowledgePath(writeResult2.relPath),
            operations_added: 0,
            operations_deleted: 0,
            operations_failed: 0,
            operations_merged: 0,
            operations_updated: 1,
            outcome: "completed",
            pending_review_count: 0,
            project_path_hash: await projectHashForRoot(root),
            ...await spaceAttributionForRoot(root),
            tags: meta2.tags,
            task_id: taskId,
            task_type: TASK_TYPE.RECORD
          }
        }), {
          ok: !0,
          data: {
            from_path: sourceRel,
            to_path: writeResult2.relPath,
            dangling_refs: danglingRefs2
          }
        };
      }
      if (!fromSpaceFlag || !toSpaceFlag)
        return {
          ok: !1,
          error: "move requires either --to-path <new-path> (in-space) or both --from-space <name-or-id> and --to-space <name-or-id> (cross-space)"
        };
      if (fromSpaceFlag === toSpaceFlag)
        return {
          ok: !1,
          error: "move source and destination are the same space; nothing to do"
        };
      let fromRoot, toRoot;
      try {
        fromRoot = await resolveSpaceFlag(fromSpaceFlag), toRoot = await resolveSpaceFlag(toSpaceFlag);
      } catch (err) {
        return {
          ok: !1,
          error: err instanceof Error ? err.message : String(err)
        };
      }
      let fromBlocked = await legacyGuard(fromRoot);
      if (fromBlocked) return fromBlocked;
      let toBlocked = await legacyGuard(toRoot);
      if (toBlocked) return toBlocked;
      let rel = canonicalRel(topicPath), fromAbs = resolveWithinTree(fromRoot, rel), sourceHtml;
      try {
        sourceHtml = await readFile27(fromAbs, "utf8");
      } catch {
        return {
          ok: !1,
          error: `no topic to move at "${topicPath}" in source space`
        };
      }
      let sourceSignal = await getSignal(fromRoot, rel), danglingRefs = [], siblings = (await listTopics(fromRoot)).filter((p) => p !== rel);
      for (let sib of siblings)
        try {
          let sibAbs = resolveWithinTree(fromRoot, sib), sibHtml = await readFile27(sibAbs, "utf8"), related = readTopicRootAttribute(sibHtml, "related");
          parseRelatedAttr(related).some((ref) => refTargets(ref, rel)) && danglingRefs.push(sib);
        } catch {
        }
      let writeResult = await writeTopic(toRoot, {
        agent: resolveAgent(),
        confirmOverwrite: flags.overwrite === !0,
        rawHtml: sourceHtml
      });
      if (!writeResult.ok)
        return await emit2({
          name: AnalyticsEventNames.RECORD_RUN_COMPLETED,
          properties: {
            duration_ms: Date.now() - startedAt,
            knowledge_path: knowledgePath(topicPath),
            operations_added: 0,
            operations_deleted: 0,
            operations_failed: 1,
            operations_merged: 0,
            operations_updated: 0,
            outcome: "error",
            pending_review_count: 0,
            project_path_hash: await projectHashForRoot(toRoot),
            ...await spaceAttributionForRoot(toRoot),
            task_id: taskId,
            task_type: TASK_TYPE.RECORD
          }
        }), {
          ok: !1,
          error: writeResult.errors.map((e) => e.message).join("; ")
        };
      if (sourceSignal ? await updateSignal(toRoot, writeResult.relPath, () => sourceSignal) : await updateSignal(
        toRoot,
        writeResult.relPath,
        () => createDefaultRuntimeSignals()
      ), await recordDeleteIntentBestEffort(fromRoot, rel), !(await applyDelete(fromRoot, topicPath)).ok)
        return await emit2({
          name: AnalyticsEventNames.RECORD_RUN_COMPLETED,
          properties: {
            duration_ms: Date.now() - startedAt,
            knowledge_path: knowledgePath(topicPath),
            operations_added: writeResult.created ? 1 : 0,
            operations_deleted: 0,
            operations_failed: 1,
            operations_merged: 0,
            operations_updated: writeResult.created ? 0 : 1,
            outcome: "error",
            pending_review_count: 0,
            project_path_hash: await projectHashForRoot(toRoot),
            ...await spaceAttributionForRoot(toRoot),
            task_id: taskId,
            task_type: TASK_TYPE.RECORD
          }
        }), {
          ok: !1,
          error: `move wrote destination "${rel}" in target space but could not remove source from origin space`,
          data: {
            written_at: writeResult.relPath,
            from_path: topicPath,
            from_space: fromSpaceFlag,
            to_space: toSpaceFlag
          }
        };
      let now = (/* @__PURE__ */ new Date()).toISOString();
      await rebuildManifest(fromRoot), await rebuildIndex(fromRoot, { now }), await rebuildManifest(toRoot), await rebuildIndex(toRoot, { now }), await safeReconcile(fromRoot, {
        kind: "delete",
        path: rel,
        preservedSignal: sourceSignal,
        source: "skill"
      }), await safeReconcile(toRoot, {
        kind: "create",
        path: writeResult.relPath,
        source: "skill"
      });
      try {
        await new Reconciler(toRoot).rebindOrphans();
      } catch {
      }
      let meta = await topicMetadata(toRoot, writeResult.relPath);
      return await emit2({
        name: AnalyticsEventNames.RECORD_RUN_COMPLETED,
        properties: {
          duration_ms: Date.now() - startedAt,
          keywords: meta.keywords,
          knowledge_path: knowledgePath(writeResult.relPath),
          operations_added: 0,
          operations_deleted: 0,
          operations_failed: 0,
          operations_merged: 0,
          operations_updated: 1,
          outcome: "completed",
          pending_review_count: 0,
          project_path_hash: await projectHashForRoot(toRoot),
          ...await spaceAttributionForRoot(toRoot),
          tags: meta.tags,
          task_id: taskId,
          task_type: TASK_TYPE.RECORD
        }
      }), {
        ok: !0,
        data: {
          from_space: fromSpaceFlag,
          to_space: toSpaceFlag,
          path: writeResult.relPath,
          dangling_refs: danglingRefs
        }
      };
    }
    case "link": {
      let aPath = positionals[0], bPath = positionals[1];
      if (!aPath || !bPath)
        return {
          ok: !1,
          error: "link requires two topic paths"
        };
      let aRel = canonicalRel(aPath), bRel = canonicalRel(bPath);
      if (aRel === bRel)
        return {
          ok: !1,
          error: "link cannot link a topic to itself"
        };
      let resolvedRoot = await rootForRecord(flags);
      if (resolvedRoot.kind === "error") return resolvedRoot.result;
      let root = resolvedRoot.root, blocked = await legacyGuard(root);
      if (blocked) return blocked;
      let signer = await buildTopicSignerForRoot(root), removeMode = flags.remove === !0, bidirectional = flags.bidirectional === !0;
      if (!removeMode) {
        let bAbs = resolveWithinTree(root, bRel);
        if (!existsSync4(bAbs))
          return {
            ok: !1,
            error: `no topic at "${bRel}"`
          };
        if (bidirectional) {
          let aAbs = resolveWithinTree(root, aRel);
          if (!existsSync4(aAbs))
            return {
              ok: !1,
              error: `no topic at "${aRel}"`
            };
        }
      }
      async function applyLinkSide(fromRel, targetRel) {
        let abs = resolveWithinTree(root, fromRel), html;
        try {
          html = await readFile27(abs, "utf8");
        } catch {
          return { error: `no topic at "${fromRel}"` };
        }
        let existing = parseRelatedAttr(
          readTopicRootAttribute(html, "related")
        ), hasIt = existing.some((r) => r.targetPath === targetRel);
        if (removeMode && !hasIt)
          return { op: "noop", relPath: fromRel };
        if (!removeMode && hasIt)
          return { op: "noop", relPath: fromRel };
        let targetRef = `@${targetRel}`, nextTokens = removeMode ? existing.filter((r) => r.targetPath !== targetRel).map((r) => r.raw) : [...existing.map((r) => r.raw), targetRef], patched = nextTokens.length === 0 ? removeBvTopicRootAttributes(html, ["related"]) : patchBvTopicRootAttributes(html, {
          related: nextTokens.join(",")
        }), writeResult = await writeTopic(root, {
          agent: resolveAgent(),
          confirmOverwrite: !0,
          rawHtml: patched,
          signer
        });
        return writeResult.ok ? {
          op: removeMode ? "removed" : "added",
          relPath: writeResult.relPath
        } : {
          error: writeResult.errors.map((e) => e.message).join("; ")
        };
      }
      let edges = [], aOutcome = await applyLinkSide(aRel, bRel);
      if ("error" in aOutcome)
        return { ok: !1, error: aOutcome.error };
      if (edges.push({ from: aRel, to: bRel, op: aOutcome.op }), bidirectional) {
        let bOutcome = await applyLinkSide(bRel, aRel);
        if ("error" in bOutcome)
          return { ok: !1, error: bOutcome.error };
        edges.push({ from: bRel, to: aRel, op: bOutcome.op });
      }
      let mutated = edges.filter((e) => e.op !== "noop");
      if (mutated.length > 0) {
        await rebuildManifest(root), await rebuildIndex(root, { now: (/* @__PURE__ */ new Date()).toISOString() });
        for (let edge of mutated)
          await safeReconcile(root, {
            kind: "rewrite",
            path: edge.from,
            source: "skill"
          });
      }
      return { ok: !0, data: { edges } };
    }
    case "read": {
      let startedAt = Date.now(), taskId = randomUUID8(), path2 = positionals[0];
      if (!path2)
        return await emit2({
          name: AnalyticsEventNames.READ_COMPLETED,
          properties: {
            duration_ms: Date.now() - startedAt,
            outcome: "error",
            read_doc_count: 0,
            task_id: taskId,
            task_type: TASK_TYPE.READ
          }
        }), { ok: !1, error: "read requires a topic path" };
      let root = await rootFrom(flags), blocked = await legacyGuard(root);
      if (blocked)
        return await emit2({
          name: AnalyticsEventNames.READ_COMPLETED,
          properties: {
            duration_ms: Date.now() - startedAt,
            outcome: "error",
            project_path_hash: await projectHashForRoot(root),
            read_doc_count: 0,
            task_id: taskId,
            task_type: TASK_TYPE.READ,
            ...await spaceAttributionForRoot(root)
          }
        }), blocked;
      try {
        let data = await readTopic(root, path2), rawHtml;
        if (flags.raw === !0) {
          let abs = resolveWithinTree(root, canonicalRel(path2));
          rawHtml = await readFile27(abs, "utf8");
        }
        let meta = await topicMetadata(root, path2);
        return await emit2({
          name: AnalyticsEventNames.READ_COMPLETED,
          properties: {
            duration_ms: Date.now() - startedAt,
            outcome: "completed",
            project_path_hash: await projectHashForRoot(root),
            read_doc_count: 1,
            read_paths_with_metadata: [
              {
                keywords: meta.keywords,
                related_paths: meta.related.map((rel) => ({
                  keywords: [],
                  relative_path: `${CONTEXT_TREE_PREFIX}${knowledgePath(rel)}.html`,
                  tags: []
                })),
                relative_path: `${CONTEXT_TREE_PREFIX}${knowledgePath(path2)}.html`,
                tags: meta.tags
              }
            ],
            task_id: taskId,
            task_type: TASK_TYPE.READ,
            ...await spaceAttributionForRoot(root)
          }
        }), {
          ok: !0,
          data: rawHtml !== void 0 ? { ...data, rawHtml } : data
        };
      } catch (err) {
        throw await emit2({
          name: AnalyticsEventNames.READ_COMPLETED,
          properties: {
            duration_ms: Date.now() - startedAt,
            outcome: "error",
            project_path_hash: await projectHashForRoot(root),
            read_doc_count: 0,
            task_id: taskId,
            task_type: TASK_TYPE.READ,
            ...await spaceAttributionForRoot(root)
          }
        }), err;
      }
    }
    case "list": {
      let root = await rootFrom(flags), blocked = await legacyGuard(root);
      return blocked || { ok: !0, data: { topics: await listTopics(root) } };
    }
    case "manifest": {
      let root = await rootFrom(flags), blocked = await legacyGuard(root);
      if (blocked) return blocked;
      let manifest = await rebuildManifest(root);
      return await rebuildIndex(root, { now: (/* @__PURE__ */ new Date()).toISOString() }), { ok: !0, data: manifest };
    }
    case "reconcile": {
      let root = await rootFrom(flags), blocked = await legacyGuard(root);
      if (blocked) return blocked;
      let reconciler = new Reconciler(root);
      try {
        return flags["rebind-orphans"] === !0 ? { ok: !0, data: { kind: "rebind-orphans", ...await reconciler.rebindOrphans() } } : flags["dry-run"] === !0 ? {
          ok: !0,
          data: {
            kind: "dry-run",
            note: "v1: reports actions taken, but reconciler is idempotent so derived state IS refreshed; no real opt-out yet",
            ...await reconciler.reconcileFull()
          }
        } : { ok: !0, data: { kind: "full", ...await reconciler.reconcileFull() } };
      } catch (err) {
        return {
          ok: !1,
          error: `reconcile failed: ${err instanceof Error ? err.message : String(err)}`
        };
      }
    }
    case "query":
    case "search": {
      let startedAt = Date.now(), taskId = randomUUID8(), query = positionals.join(" "), QUERY_TEXT_MAX = 512, queryProp = query.length === 0 ? {} : {
        query: query.length > QUERY_TEXT_MAX ? `${query.slice(0, QUERY_TEXT_MAX - 1)}\u2026` : query
      }, limit = str2(flags.limit) ? Number(str2(flags.limit)) : 10, resolvedRoots = await rootsForQuery(flags);
      if (resolvedRoots.kind === "error") return resolvedRoots.result;
      let elementTag = str2(flags["element-tag"]);
      if (elementTag !== void 0 && !ELEMENT_NAMES.includes(elementTag))
        return {
          ok: !1,
          error: `unknown --element-tag "${elementTag}" (not a <bv-*> element)`
        };
      if (resolvedRoots.kind === "aggregate") {
        let perRootLimit = Math.max(limit, 10), allHits = [];
        for (let cloudRoot of resolvedRoots.roots) {
          let hits2 = await search(cloudRoot.root, query, perRootLimit, {
            elementHint: elementTag ? {
              attr: str2(flags["element-attr"]),
              tag: elementTag,
              value: str2(flags["element-value"])
            } : void 0,
            now: (/* @__PURE__ */ new Date()).toISOString(),
            scope: str2(flags.scope)
          });
          for (let hit of hits2)
            allHits.push({
              ...hit,
              space_id: cloudRoot.space_id,
              space_name: cloudRoot.space_name,
              team_id: cloudRoot.team_id,
              root: cloudRoot.root
            });
        }
        allHits.sort(
          (a, b) => b.score - a.score || a.space_name.localeCompare(b.space_name) || a.space_id.localeCompare(b.space_id) || a.path.localeCompare(b.path)
        );
        let finalHits = allHits.slice(0, limit);
        for (let hit of finalHits)
          await recordUse(hit.root, hit.path);
        let completedAt = Date.now(), hitsBySpace = /* @__PURE__ */ new Map();
        for (let hit of finalHits) {
          let group = hitsBySpace.get(hit.space_id);
          group ? group.push(hit) : hitsBySpace.set(hit.space_id, [hit]);
        }
        for (let spaceHits of hitsBySpace.values()) {
          let enriched2 = await Promise.all(
            spaceHits.slice(0, 10).map(async (hit) => {
              let meta = await topicMetadata(hit.root, hit.path);
              return {
                keywords: meta.keywords,
                related_paths: meta.related.map((rel) => ({
                  keywords: [],
                  relative_path: `${CONTEXT_TREE_PREFIX}${knowledgePath(rel)}.html`,
                  tags: []
                })),
                relative_path: `${CONTEXT_TREE_PREFIX}${knowledgePath(hit.path)}.html`,
                tags: meta.tags
              };
            })
          ), head = spaceHits[0];
          await emit2({
            name: AnalyticsEventNames.QUERY_COMPLETED,
            properties: {
              cache_hit: !1,
              duration_ms: completedAt - startedAt,
              matched_doc_count: spaceHits.length,
              outcome: "completed",
              ...queryProp,
              read_doc_count: 0,
              read_paths_with_metadata: enriched2,
              read_tool_call_count: 0,
              search_call_count: 0,
              task_id: taskId,
              task_type: TASK_TYPE.QUERY,
              space_id: head.space_id,
              ...head.team_id ? { team_id: head.team_id } : {}
            }
          });
        }
        let topHit = finalHits[0], topSpaceId = topHit ? spaceIdFromRoot(topHit.root) : void 0, sameSpaceHits = topSpaceId === void 0 ? [] : finalHits.filter(
          (h) => spaceIdFromRoot(h.root) === topSpaceId
        ), slimHits = finalHits.map(({ root: _root, ...hit }) => hit), slimSameSpaceHits = sameSpaceHits.map(
          ({ root: _root, ...hit }) => hit
        ), citationHitsList2 = topSpaceId ? await citationHits(sameSpaceHits, null) : [], citation_block2 = topSpaceId ? formatCitationBlock(citationHitsList2, {
          spaceId: topSpaceId,
          webBaseUrl: resolveWebBaseUrl()
        }) : "", should_cite2 = shouldCite(slimSameSpaceHits) && topSpaceId !== void 0;
        return {
          ok: !0,
          data: { citation_block: citation_block2, hits: slimHits, query, should_cite: should_cite2 }
        };
      }
      let root = resolvedRoots.root, blocked = await legacyGuard(root);
      if (blocked) return blocked;
      let hits = await search(root, query, limit, {
        elementHint: elementTag ? {
          attr: str2(flags["element-attr"]),
          tag: elementTag,
          value: str2(flags["element-value"])
        } : void 0,
        now: (/* @__PURE__ */ new Date()).toISOString(),
        scope: str2(flags.scope)
      });
      for (let hit of hits)
        await recordUse(root, hit.path);
      let enriched = await Promise.all(
        hits.slice(0, 10).map(async (hit) => {
          let meta = await topicMetadata(root, hit.path);
          return {
            keywords: meta.keywords,
            related_paths: meta.related.map((rel) => ({
              keywords: [],
              relative_path: `${CONTEXT_TREE_PREFIX}${knowledgePath(rel)}.html`,
              tags: []
            })),
            relative_path: `${CONTEXT_TREE_PREFIX}${knowledgePath(hit.path)}.html`,
            tags: meta.tags
          };
        })
      );
      await emit2({
        name: AnalyticsEventNames.QUERY_COMPLETED,
        properties: {
          cache_hit: !1,
          duration_ms: Date.now() - startedAt,
          matched_doc_count: hits.length,
          outcome: "completed",
          project_path_hash: await projectHashForRoot(root),
          ...queryProp,
          ...await spaceAttributionForRoot(root),
          read_doc_count: 0,
          read_paths_with_metadata: enriched,
          read_tool_call_count: 0,
          search_call_count: 0,
          task_id: taskId,
          task_type: TASK_TYPE.QUERY
        }
      });
      let spaceId = spaceIdFromRoot(root), citationHitsList = spaceId ? await citationHits(hits, root) : [], citation_block = spaceId ? formatCitationBlock(citationHitsList, {
        spaceId,
        webBaseUrl: resolveWebBaseUrl()
      }) : "", should_cite = shouldCite(hits) && spaceId !== void 0;
      return {
        ok: !0,
        data: { citation_block, hits, query, should_cite }
      };
    }
    case "recall": {
      let query = positionals.join(" ").trim(), limit = str2(flags.limit) ? Number(str2(flags.limit)) : 5, empty = {
        ok: !0,
        data: { content: "", matchedDocs: [] }
      };
      if (!query) return empty;
      try {
        let root = await rootFrom(flags), hits = await search(root, query, limit, {
          now: (/* @__PURE__ */ new Date()).toISOString()
        }), blocks = [], matchedDocs = [];
        for (let hit of hits)
          try {
            let abs = resolveWithinTree(root, hit.path), raw = await readFile27(abs, "utf8");
            blocks.push(raw), matchedDocs.push({
              path: hit.path,
              title: hit.title,
              score: hit.score,
              snippet: hit.snippet
            });
          } catch {
          }
        return {
          ok: !0,
          data: {
            content: blocks.join(`

---

`),
            matchedDocs
          }
        };
      } catch {
        return empty;
      }
    }
    case "dream": {
      let startedAt = Date.now(), taskId = randomUUID8(), root = await rootFrom(flags), blocked = await legacyGuard(root);
      if (blocked) return blocked;
      let mode = str2(flags.mode) ?? "merge", num = (key) => str2(flags[key]) !== void 0 ? Number(str2(flags[key])) : void 0, minScore = num("min-score"), limit = num("limit"), candidates, staleCandidateCount;
      switch (mode) {
        case "link": {
          candidates = await findLinkCandidates(root, { limit, minScore });
          break;
        }
        case "merge": {
          candidates = await scanDreamCandidates(root, { limit, minScore });
          break;
        }
        case "prune": {
          let pruneCandidates = await findPruneCandidates(root, {
            limit,
            maxImportance: num("max-importance"),
            now: (/* @__PURE__ */ new Date()).toISOString()
          });
          candidates = pruneCandidates, staleCandidateCount = countStaleCandidates(pruneCandidates);
          break;
        }
        case "synthesize": {
          candidates = await findSynthesizeCandidates(root, {
            minTopics: num("min-topics")
          });
          break;
        }
        default:
          return {
            ok: !1,
            error: `unknown dream mode "${mode}" (merge|link|prune|synthesize)`
          };
      }
      let candidateCount = Array.isArray(candidates) ? candidates.length : 0;
      return await emit2({
        name: AnalyticsEventNames.DREAM_COMPLETED,
        properties: {
          candidate_count: candidateCount,
          ...staleCandidateCount !== void 0 ? { stale_candidate_count: staleCandidateCount } : {},
          duration_ms: Date.now() - startedAt,
          mode,
          outcome: "completed",
          project_path_hash: await projectHashForRoot(root),
          ...await spaceAttributionForRoot(root),
          task_id: taskId,
          task_type: TASK_TYPE.DREAM
        }
      }), { ok: !0, data: { candidates, mode } };
    }
    case "merge": {
      let startedAt = Date.now(), taskId = randomUUID8(), survivorPath = positionals[0], loserPath = positionals[1];
      if (!survivorPath || !loserPath)
        return {
          ok: !1,
          error: "merge requires a survivor and a loser topic path"
        };
      let resolvedRoot = await rootForRecord(flags);
      if (resolvedRoot.kind === "error") return resolvedRoot.result;
      let root = resolvedRoot.root, blocked = await legacyGuard(root);
      if (blocked) return blocked;
      let signer = await buildTopicSignerForRoot(root), titleFlag = str2(flags.title);
      if (titleFlag !== void 0 && titleFlag.trim().length === 0)
        return {
          ok: !1,
          error: "merge --title cannot be empty"
        };
      await recordDeleteIntentBestEffort(root, canonicalRel(loserPath));
      let result = await applyMerge(
        root,
        {
          agent: resolveAgent(),
          keywords: str2(flags.keywords),
          loserPath,
          reason: str2(flags.reason),
          related: str2(flags.related),
          signer,
          summary: str2(flags.summary),
          survivorPath,
          tags: str2(flags.tags),
          title: titleFlag
        },
        (/* @__PURE__ */ new Date()).toISOString()
      );
      if (!result.ok)
        return await emit2({
          name: AnalyticsEventNames.RECORD_RUN_COMPLETED,
          properties: {
            duration_ms: Date.now() - startedAt,
            knowledge_path: knowledgePath(survivorPath),
            operations_added: 0,
            operations_deleted: 0,
            operations_failed: 1,
            operations_merged: 0,
            operations_updated: 0,
            outcome: "error",
            pending_review_count: 0,
            project_path_hash: await projectHashForRoot(root),
            ...await spaceAttributionForRoot(root),
            task_id: taskId,
            task_type: TASK_TYPE.RECORD
          }
        }), { ok: !1, error: result.error };
      await rebuildManifest(root), await rebuildIndex(root, { now: (/* @__PURE__ */ new Date()).toISOString() }), await safeReconcile(root, {
        kind: "merge",
        path: canonicalRel(survivorPath),
        survivorPath: canonicalRel(survivorPath),
        loserPath: canonicalRel(loserPath),
        source: "skill"
      });
      let meta = await topicMetadata(root, canonicalRel(survivorPath));
      return await emit2({
        name: AnalyticsEventNames.RECORD_RUN_COMPLETED,
        properties: {
          duration_ms: Date.now() - startedAt,
          keywords: meta.keywords,
          knowledge_path: knowledgePath(survivorPath),
          operations_added: 0,
          operations_deleted: 0,
          operations_failed: 0,
          operations_merged: 1,
          operations_updated: 0,
          outcome: "completed",
          pending_review_count: 0,
          project_path_hash: await projectHashForRoot(root),
          ...await spaceAttributionForRoot(root),
          tags: meta.tags,
          task_id: taskId,
          task_type: TASK_TYPE.RECORD
        }
      }), { ok: !0, data: result };
    }
    case "migrate": {
      let root = await rootFrom(flags), now = (/* @__PURE__ */ new Date()).toISOString();
      return { ok: !0, data: await migrateTree(root, {
        batchId: str2(flags.batch) ?? `migration-${now.slice(0, 10)}`,
        dryRun: flags["dry-run"] === !0,
        now
      }) };
    }
    case "rollback": {
      let root = await rootFrom(flags);
      return { ok: !0, data: await rollback(root, {
        batchId: str2(flags.batch),
        dryRun: flags["dry-run"] === !0,
        now: (/* @__PURE__ */ new Date()).toISOString()
      }) };
    }
    case "space": {
      let sub = positionals[0], args = positionals.slice(1);
      switch (sub) {
        case "list":
          return runSpaceList();
        case "current":
          return runSpaceCurrent();
        case "bind":
          return runSpaceBind(args[0]);
        case "unbind":
          return runSpaceUnbind();
        case "rename":
          return runSpaceRename(args[0], args[1], flags);
        case "restore":
          return runSpaceRestore(args[0]);
        case "identity":
          return runSpaceIdentity();
        case "verify":
          return runSpaceVerify(args[0], flags);
        case "disclose":
          return runSpaceDisclose(args[0], flags);
        case "reidentify":
          return runSpaceReidentify(flags);
        case void 0:
          return {
            ok: !1,
            error: "space: subcommand required (list|current|bind|unbind|rename|restore|identity|verify|disclose|reidentify)"
          };
        default:
          return {
            ok: !1,
            error: `space: unknown subcommand "${sub}" (list|current|bind|unbind|rename|restore|identity|verify|disclose|reidentify)`
          };
      }
    }
    default:
      return { ok: !1, error: `Unknown command: ${name}` };
  }
}
async function countTopics(root) {
  let count = 0;
  async function walk3(dir) {
    let entries;
    try {
      entries = await readdir8(dir, { withFileTypes: !0 });
    } catch {
      return;
    }
    for (let e of entries) {
      let abs = join29(dir, e.name);
      e.isDirectory() ? await walk3(abs) : e.name.endsWith(".html") && count++;
    }
  }
  return await walk3(root), count;
}
async function runSpaceList() {
  let dir = getProjectsDir(), onDisk = /* @__PURE__ */ new Set();
  try {
    let entries = await readdir8(dir, { withFileTypes: !0 });
    for (let e of entries)
      e.isDirectory() && isUuid(e.name) && onDisk.add(e.name);
  } catch {
  }
  let bindings = await readBindings(), activeBindingsBySpace = /* @__PURE__ */ new Map();
  for (let b of bindings) {
    if (b.removedAt !== void 0) continue;
    let list = activeBindingsBySpace.get(b.space_id) ?? [];
    list.push(b.folder), activeBindingsBySpace.set(b.space_id, list), onDisk.add(b.space_id);
  }
  let ids = [...onDisk].sort();
  return { ok: !0, data: { spaces: await Promise.all(
    ids.map(async (space_id) => {
      let meta = await readSpaceMetadata(join29(dir, space_id)).catch(
        () => null
      ), root = spaceContextTreePath(space_id), topicCount = await pathExists(root) ? await countTopics(root) : 0;
      return {
        boundFolders: activeBindingsBySpace.get(space_id) ?? [],
        space_id,
        space_name: meta?.space_name ?? "Untitled Space",
        team_id: meta?.team_id ?? null,
        team_name: meta?.team_name ?? null,
        topicCount
      };
    })
  ) } };
}
async function runSpaceCurrent() {
  let resolution;
  try {
    resolution = await resolveSpace(process.cwd());
  } catch (err) {
    if (err instanceof InvalidMarkerError)
      return { ok: !1, error: err.message, code: "invalid-marker" };
    if (err instanceof NoDefaultSpaceError)
      return { code: "no-default", error: err.message, ok: !1 };
    throw err;
  }
  let data = {
    source: resolution.source,
    space_id: resolution.space_id
  };
  resolution.source === "marker" && (data.markerPath = resolution.markerPath);
  let meta = await readSpaceMetadata(
    join29(getProjectsDir(), resolution.space_id)
  ).catch(() => null);
  return meta !== null ? data.space_name = meta.space_name : resolution.source === "marker" && (data.space_name = resolution.space_name), resolution.source === "registry" && (data.bindingFolder = resolution.bindingFolder), resolution.deleted !== void 0 && (data.deleted = resolution.deleted), resolution.source === "default" && !await hasTipBeenShown(process.cwd()) && (data.tip = 'Using the default space. To work in a named space, create one in the ByteRover desktop app and then run `space bind "<name>"` from this folder.'), { ok: !0, data };
}
async function runSpaceIdentity() {
  let resolution;
  try {
    resolution = await resolveSpace(process.cwd());
  } catch (err) {
    if (err instanceof InvalidMarkerError)
      return { ok: !1, error: err.message, code: "invalid-marker" };
    if (err instanceof NoDefaultSpaceError)
      return { code: "no-default", error: err.message, ok: !1 };
    throw err;
  }
  let spaceDir = cloudSpaceDir(getProjectsDir(), resolution.space_id), identity = await getOrCreateSpaceIdentity(spaceDir, resolution.space_id);
  return {
    ok: !0,
    data: {
      space_id: resolution.space_id,
      fingerprint: identity.fingerprint,
      public_key_pem: identity.publicKeyPem,
      jwk_thumbprint: identity.jwkThumbprint
    }
  };
}
async function buildTopicSignerForRoot(root) {
  let spaceDir = dirname14(root), spaceId = basename5(spaceDir), privateKeyPem = await loadSpacePrivateKey(spaceDir, spaceId).catch(
    () => null
  );
  if (!privateKeyPem) return;
  let identity = await readSpaceIdentity(spaceDir);
  if (!(!identity || identity.space_id !== spaceId))
    return (canonicalHashHex) => ({
      kid: identity.fingerprint,
      sig: signTopicHash(privateKeyPem, canonicalHashHex)
    });
}
async function runSpaceReidentify(flags) {
  let resolved = await rootForRecord(flags);
  if (resolved.kind === "error") return resolved.result;
  let root = resolved.root, spaceDir = dirname14(root), spaceId = basename5(spaceDir), identity = await readSpaceIdentity(spaceDir).catch(() => null), signer = await buildTopicSignerForRoot(root);
  if (!identity || !signer || identity.space_id !== spaceId)
    return {
      ok: !1,
      error: "no space identity \u2014 run `space identity` to create one before reidentify",
      code: "no-identity"
    };
  let topics = await listTopics(root), failed = [], resigned = 0;
  for (let rel of topics) {
    let rawHtml = await readFile27(join29(root, rel), "utf8").catch(() => null);
    if (rawHtml === null) {
      failed.push(rel);
      continue;
    }
    let res = await writeTopic(root, { rawHtml, signer, confirmOverwrite: !0 });
    res.ok && res.relPath === rel ? resigned++ : failed.push(rel);
  }
  if (failed.length > 0)
    return {
      ok: !1,
      error: `re-sign failed for ${failed.length} topic(s); the trust anchor was NOT rotated \u2014 fix and re-run`,
      code: "resign-incomplete",
      data: { topics_resigned: resigned, failed: failed.slice(0, 20) }
    };
  let cfg = await readConfig(syncStateDirForSpace(getProjectsDir(), spaceId)), apiKey = cfg ? resolveApiKey(cfg) : void 0, anchor = "not_configured";
  if (cfg && apiKey)
    if (cfg.spaceId !== identity.space_id)
      anchor = "config_mismatch";
    else
      try {
        let mint = await mintToken({ authUrl: cfg.authUrl, apiKey });
        anchor = mint.token === null ? "paused" : await new MemoryHttpClient({
          baseUrl: cfg.baseUrl,
          teamId: cfg.teamId,
          spaceId: cfg.spaceId,
          token: mint.token
        }).putIdentity(identity.publicKeyPem, { rotate: !0 });
      } catch {
        anchor = "error";
      }
  return {
    ok: !0,
    data: {
      reidentified: !0,
      fingerprint: identity.fingerprint,
      topics_resigned: resigned,
      anchor
    }
  };
}
async function runSpaceVerify(topicPath, flags) {
  if (!topicPath)
    return {
      ok: !1,
      error: "space verify: <topic-path> is required",
      code: "missing-path"
    };
  let selection;
  try {
    selection = await rootsForQuery(flags);
  } catch (err) {
    if (err instanceof InvalidMarkerError)
      return { ok: !1, error: err.message, code: "invalid-marker" };
    throw err;
  }
  if (selection.kind === "error") return selection.result;
  if (selection.kind === "aggregate")
    return {
      ok: !1,
      code: "ambiguous-space",
      error: "space verify needs a single space; bind one (`space bind`) or pass `--space`/`--root`"
    };
  let root = selection.root, identity = await readSpaceIdentity(dirname14(root));
  if (!identity)
    return {
      ok: !1,
      code: "no-identity",
      error: "this space has no cryptographic identity yet; run `space identity` first"
    };
  let rel = topicPath.endsWith(".html") ? topicPath : `${topicPath}.html`, abs = resolve10(root, ...rel.split("/"));
  if (!abs.startsWith(resolve10(root) + sep7))
    return {
      ok: !1,
      code: "unsafe-path",
      error: `unsafe topic path: ${topicPath}`
    };
  let html;
  try {
    html = await readFile27(abs, "utf8");
  } catch {
    return { ok: !1, code: "not-found", error: `topic not found: ${topicPath}` };
  }
  let result = verifyHtmlTopic(html, identity.publicKeyPem);
  return result.ok ? {
    ok: !0,
    data: { kid: identity.fingerprint, topic_path: topicPath, verified: !0 }
  } : {
    ok: !1,
    code: result.reason,
    error: `topic "${topicPath}" did not verify: ${result.reason}`,
    data: { reason: result.reason, verified: !1 }
  };
}
async function runSpaceDisclose(topicPath, flags) {
  if (!topicPath)
    return {
      ok: !1,
      error: "space disclose: <topic-path> is required",
      code: "missing-path"
    };
  let requested = str2(flags.layer) ?? "full";
  if (requested !== "full" && requested !== "redacted" && requested !== "metadata")
    return {
      ok: !1,
      code: "invalid-layer",
      error: `unknown --layer "${requested}" (full|redacted|metadata)`
    };
  let layer = requested, selection;
  try {
    selection = await rootsForQuery(flags);
  } catch (err) {
    if (err instanceof InvalidMarkerError)
      return { ok: !1, error: err.message, code: "invalid-marker" };
    throw err;
  }
  if (selection.kind === "error") return selection.result;
  if (selection.kind === "aggregate")
    return {
      ok: !1,
      code: "ambiguous-space",
      error: "space disclose needs a single space; pass `--space`/`--root`"
    };
  let root = selection.root, rel = topicPath.endsWith(".html") ? topicPath : `${topicPath}.html`, abs = resolve10(root, ...rel.split("/"));
  if (!abs.startsWith(resolve10(root) + sep7))
    return {
      ok: !1,
      code: "unsafe-path",
      error: `unsafe topic path: ${topicPath}`
    };
  let html;
  try {
    html = await readFile27(abs, "utf8");
  } catch {
    return { ok: !1, code: "not-found", error: `topic not found: ${topicPath}` };
  }
  let layeredHtml = materializeLayer(html, layer);
  if (flags.manifest === !0) {
    let spaceDir = dirname14(root), identity = await readSpaceIdentity(spaceDir), privateKeyPem = identity ? await loadSpacePrivateKey(spaceDir, basename5(spaceDir)).catch(() => null) : null;
    if (!identity || !privateKeyPem)
      return {
        ok: !1,
        code: "no-identity",
        error: "signing a disclosure manifest needs the space identity; run `space identity` first"
      };
    let manifest = buildDisclosureManifest(
      html,
      layeredHtml,
      layer,
      (/* @__PURE__ */ new Date()).toISOString()
    );
    return {
      ok: !0,
      data: {
        layer,
        html: layeredHtml,
        manifest,
        signature: signDisclosureManifest(manifest, privateKeyPem)
      }
    };
  }
  return { ok: !0, data: { layer, html: layeredHtml } };
}
async function runSpaceBind(name) {
  let cwd = process.cwd(), space_id, space_name, pinned = !1;
  if (name !== void 0) {
    try {
      validateSpaceDisplayName(name);
    } catch (err) {
      return {
        ok: !1,
        error: err instanceof Error ? err.message : String(err),
        code: "invalid-space-name"
      };
    }
    let found = await findSpaceIdByDisplayName(name);
    if (found === null)
      return {
        code: "space-not-found",
        error: `Space "${name}" not found. Create it in the ByteRover desktop app first, then re-run \`space bind "${name}"\`.`,
        ok: !1
      };
    space_id = found, space_name = name;
  } else {
    let resolution;
    try {
      resolution = await resolveSpace(cwd);
    } catch (err) {
      if (err instanceof InvalidMarkerError)
        return { ok: !1, error: err.message, code: "invalid-marker" };
      if (err instanceof NoDefaultSpaceError)
        return { code: "no-default", error: err.message, ok: !1 };
      throw err;
    }
    space_id = resolution.space_id;
    let meta = await readSpaceMetadata(
      join29(getProjectsDir(), space_id)
    ).catch(() => null);
    meta !== null ? space_name = meta.space_name : resolution.source === "marker" ? space_name = resolution.space_name : space_name = "Untitled Space", pinned = !0;
  }
  try {
    await writeMarker(cwd, { space_id, space_name });
  } catch (err) {
    return {
      ok: !1,
      error: `Could not write marker: ${err.message}`,
      code: "marker-write-failed"
    };
  }
  return await addBinding(cwd, space_id), {
    data: {
      folder: cwd,
      marker: join29(cwd, MARKER_FILENAME),
      pinnedFromResolver: pinned,
      space_id,
      space_name
    },
    ok: !0
  };
}
async function runSpaceUnbind() {
  let cwd = process.cwd(), markerPath = join29(cwd, MARKER_FILENAME), previousSpaceId, marker = await readMarkerAt(cwd).catch(() => null);
  marker !== null && (previousSpaceId = marker.space_id);
  let active = (await readBindings()).find(
    (b) => resolve10(b.folder) === resolve10(cwd) && b.removedAt === void 0
  );
  if (active !== void 0 && previousSpaceId === void 0 && (previousSpaceId = active.space_id), previousSpaceId === void 0 && active === void 0)
    return {
      ok: !1,
      error: `cwd ${cwd} is not bound to any space`,
      code: "not-bound"
    };
  if (marker !== null)
    try {
      await rm18(markerPath, { force: !0 });
    } catch (err) {
      return {
        ok: !1,
        error: `Could not remove marker: ${err.message}`,
        code: "marker-remove-failed"
      };
    }
  return await removeBinding(cwd), {
    data: {
      folder: cwd,
      previousSpaceId: previousSpaceId ?? null
    },
    ok: !0
  };
}
async function runSpaceRestore(space_id) {
  if (!space_id)
    return {
      ok: !1,
      error: "space restore: <space_id> is required",
      code: "missing-space-id"
    };
  if (!isUuid(space_id))
    return {
      ok: !1,
      error: `space restore: "${space_id}" is not a valid space_id (expected a UUID)`,
      code: "invalid-space-id"
    };
  let before = await isSpaceDeleted(space_id);
  return before.deleted && before.hard ? {
    ok: !1,
    error: `space restore: "${space_id}" was hard-deleted and cannot be restored.`,
    code: "space-hard-deleted"
  } : (await unmarkSpaceDeleted(space_id), {
    data: { space_id, restored: before.deleted },
    ok: !0
  });
}
async function pathExists(p) {
  try {
    return await stat8(p), !0;
  } catch {
    return !1;
  }
}
async function runSpaceRename(oldName, newName, _flags) {
  if (!oldName || !newName)
    return {
      ok: !1,
      error: "space rename: <old> <new> are both required",
      code: "missing-name"
    };
  try {
    validateSpaceDisplayName(oldName), validateSpaceDisplayName(newName);
  } catch (err) {
    return {
      ok: !1,
      error: err instanceof Error ? err.message : String(err),
      code: "invalid-space-name"
    };
  }
  if (oldName === newName)
    return {
      ok: !1,
      error: `<old> and <new> are identical ("${oldName}")`,
      code: "no-op"
    };
  let space_id = await findSpaceIdByDisplayName(oldName);
  if (space_id === null)
    return {
      code: "space-not-found",
      error: `No space named "${oldName}" found`,
      ok: !1
    };
  if (await findSpaceIdByDisplayName(newName) !== null)
    return {
      code: "target-exists",
      error: `A space named "${newName}" already exists`,
      ok: !1
    };
  let spaceDir = join29(getProjectsDir(), space_id), meta = await readSpaceMetadata(spaceDir);
  return meta === null ? {
    code: "no-metadata",
    error: `Space ${space_id} has no metadata.json \u2014 cannot rename`,
    ok: !1
  } : (await writeSpaceMetadata(spaceDir, { ...meta, space_name: newName }), {
    data: {
      from: oldName,
      space_id,
      to: newName
    },
    ok: !0
  });
}
var USAGE = `byterover \u2014 deterministic memory engine (skill runtime)

Usage: node scripts/<command>.mjs [args]
   or: node scripts/brv.mjs <command> [args]

Commands:
  record <path> [--html "<bv-topic>\u2026"] | (--title T [--summary S] [--keywords a,b] --body "\u2026") [--overwrite]
  read <path>                        print a topic (attributes + body + elements)
  list                               list topic paths
  manifest                           rebuild and print _manifest.json
  query <terms...> [--limit N] [--scope prefix] [--element-tag bv-rule [--element-attr severity --element-value must]]
                                     BM25 + signal-ranked search w/ recency decay + structural pre-filter (alias: search)
  dream [--mode merge|link|prune|synthesize] [--min-score N] [--limit N]
                                     propose consolidation candidates (default: merge). PROPOSAL ONLY \u2014 no file ops.
  merge <survivor> <loser> [--reason R] [--summary S] [--related a,b] [--tags a,b] [--keywords a,b]
                                     fold loser topic into survivor atomically (combine + write + remove loser)
  prune <path>...                    remove one or more topics atomically (abort on first failure with partial report)
  synthesize <new-path> --html "<bv-topic>\u2026" --absorb a.html,b.html,...
                                     write a new consolidated topic and remove the absorbed inputs atomically
  move <from-path> <to-path>         atomically rename a topic and rewrite related= references in every other topic
  migrate [--dry-run] [--batch ID]   convert a legacy markdown tree to <bv-*> HTML (archives .md, reversible)
  rollback [--batch ID] [--dry-run]  restore archived .md and remove generated .html
  space list                         enumerate spaces with topic counts and bound folders
  space current                      report the space the cwd resolves to (marker / registry / flatten / default)
  space bind [<name>]                bind cwd to a space; pins the current resolution if <name> omitted
  space unbind                       remove the cwd's .brvspace marker and active binding (data preserved)
  space rename <old> <new>           rename a space and record an alias so existing markers keep working
  space restore <space_id>           clear the soft-deletion tombstone for a space the backend removed (re-opens it)

All commands print a JSON result to stdout. Topics are stored as <bv-*> HTML.`;
async function main(argv) {
  let [name, ...rest] = argv;
  if (!name || name === "help" || name === "--help" || name === "-h") {
    process.stdout.write(`${USAGE}
`);
    return;
  }
  let result, startedAt = Date.now();
  try {
    result = await runCommand(name, rest);
  } catch (err) {
    result = {
      ok: !1,
      error: err instanceof Error ? err.message : String(err)
    };
  }
  await emitCommandEvent({
    command: name,
    args: rest,
    result,
    durationMs: Date.now() - startedAt
  }), process.stdout.write(`${JSON.stringify(result, null, 2)}
`), result.ok || (process.exitCode = 1);
}

// src/sync/ensure-daemon.ts
import { stat as stat9 } from "node:fs/promises";
import { join as join34 } from "node:path";

// src/sync/auth-provider.ts
async function hasDaemonAuthProvider(input) {
  let authPath = daemonAuthPath(input.projectsRoot);
  return await readDaemonAuth(authPath) !== null;
}

// src/sync/daemon-auth-identity-reader.ts
import { readFile as readFile28 } from "node:fs/promises";
async function readCurrentDaemonAuthIdentity(projectsRoot) {
  let path2 = daemonAuthPath(projectsRoot), raw;
  try {
    raw = JSON.parse(await readFile28(path2, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT")
      raw = null;
    else
      return { ok: !1, reason: "malformed-auth" };
  }
  return parseDaemonAuthIdentity(raw);
}

// src/sync/daemon-analytics-env.ts
function readDaemonAnalyticsEnv() {
  return {
    enabled: ANALYTICS_ENABLED,
    telemetryBaseUrl: ANALYTICS_TELEMETRY_URL
  };
}

// src/sync/spawn-daemon.ts
import { spawn } from "node:child_process";
import { closeSync as closeSync2 } from "node:fs";
import { dirname as dirname15, join as join31 } from "node:path";
import { fileURLToPath } from "node:url";

// src/sync/daemon-log.ts
import {
  chmodSync,
  closeSync,
  existsSync as existsSync5,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync
} from "node:fs";
import { join as join30 } from "node:path";
var DAEMON_LOG_FILE = "daemon.log", ROTATED_DAEMON_LOG_PREFIX = "daemon-", MAX_ACTIVE_DAEMON_LOG_BYTES = 150 * 1024 * 1024, ROTATED_DAEMON_LOG_RETENTION_MS = 10080 * 60 * 1e3;
function daemonDir(projectsRoot) {
  return join30(projectsRoot, ".daemon");
}
function daemonLogPath(projectsRoot) {
  return join30(daemonDir(projectsRoot), DAEMON_LOG_FILE);
}
function localDateKey(date) {
  let year = date.getFullYear(), month = String(date.getMonth() + 1).padStart(2, "0"), day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function timestampKey(date) {
  let year = date.getFullYear(), month = String(date.getMonth() + 1).padStart(2, "0"), day = String(date.getDate()).padStart(2, "0"), hour = String(date.getHours()).padStart(2, "0"), minute = String(date.getMinutes()).padStart(2, "0"), second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}-${hour}${minute}${second}`;
}
function rotatedLogPath(dir, now, suffix) {
  let base = `${ROTATED_DAEMON_LOG_PREFIX}${timestampKey(now)}`, suffixPart = suffix === 0 ? "" : `-${suffix}`;
  return join30(dir, `${base}${suffixPart}.log`);
}
function isCollisionError(err) {
  return isNodeError(err) && (err.code === "EEXIST" || err.code === "ENOTEMPTY");
}
function rotateActiveLog(logPath, dir, now, fs) {
  for (let suffix = 0; ; suffix++) {
    let candidate = rotatedLogPath(dir, now, suffix);
    if (!fs.existsSync(candidate))
      try {
        fs.renameSync(logPath, candidate);
        try {
          fs.chmodSync(candidate, 384);
        } catch {
        }
        return candidate;
      } catch (err) {
        if (isCollisionError(err)) continue;
        throw err;
      }
  }
}
function isRotatedDaemonLog(name) {
  return name.startsWith(ROTATED_DAEMON_LOG_PREFIX) && name.endsWith(".log") && name !== DAEMON_LOG_FILE;
}
function withFs(overrides = {}) {
  return {
    chmodSync,
    closeSync,
    existsSync: existsSync5,
    mkdirSync,
    openSync,
    readdirSync,
    renameSync,
    rmSync,
    statSync,
    ...overrides
  };
}
function ensureActiveLog(path2, fs) {
  let fd = fs.openSync(path2, "a", 384);
  fs.closeSync(fd);
  try {
    fs.chmodSync(path2, 384);
  } catch {
  }
}
function pruneRotatedLogs(dir, now, retentionMs, fs) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  let cutoff = now.getTime() - retentionMs;
  for (let name of names) {
    if (!isRotatedDaemonLog(name)) continue;
    let path2 = join30(dir, name);
    try {
      fs.statSync(path2).mtimeMs < cutoff && fs.rmSync(path2, { force: !0 });
    } catch {
    }
  }
}
function maintainDaemonLog(projectsRoot, options = {}) {
  let fs = withFs(options.fs), now = options.now ?? /* @__PURE__ */ new Date(), maxActiveBytes = options.maxActiveBytes ?? MAX_ACTIVE_DAEMON_LOG_BYTES, retentionMs = options.retentionMs ?? ROTATED_DAEMON_LOG_RETENTION_MS, dir = daemonDir(projectsRoot), logPath = daemonLogPath(projectsRoot);
  fs.mkdirSync(dir, { recursive: !0 });
  let rotatedPath = null;
  try {
    let active = fs.statSync(logPath), rotateForSize = active.size >= maxActiveBytes, rotateForDay = localDateKey(active.mtime) < localDateKey(now);
    (rotateForSize || rotateForDay) && (rotatedPath = rotateActiveLog(logPath, dir, now, fs));
  } catch (err) {
    if (!isNodeError(err) || err.code !== "ENOENT")
      throw err;
  }
  return pruneRotatedLogs(dir, now, retentionMs, fs), ensureActiveLog(logPath, fs), { logPath, rotatedPath };
}
function prepareDaemonLog(projectsRoot, options = {}) {
  let logPath = daemonLogPath(projectsRoot);
  try {
    maintainDaemonLog(projectsRoot, options);
  } catch {
  }
  return logPath;
}
function openDaemonLogForSpawn(projectsRoot, options = {}) {
  let fs = withFs(options.fs);
  try {
    let logPath = prepareDaemonLog(projectsRoot, options), fd = fs.openSync(logPath, "a", 384);
    try {
      fs.chmodSync(logPath, 384);
    } catch {
    }
    return fd;
  } catch {
    return "ignore";
  }
}
function isNodeError(error) {
  return typeof error == "object" && error !== null && "code" in error;
}

// src/sync/spawn-daemon.ts
function spawnDetachedEntry(projectsRoot, entryFile, args) {
  let entry = join31(dirname15(fileURLToPath(import.meta.url)), entryFile), logTarget = openDaemonLogForSpawn(projectsRoot), child = spawn(process.execPath, [entry, ...args], {
    detached: !0,
    stdio: ["ignore", logTarget, logTarget],
    cwd: process.cwd(),
    // eslint-disable-next-line no-restricted-properties -- forward the full environment to the spawned detached process
    env: process.env
  });
  return child.unref(), typeof logTarget == "number" && closeSync2(logTarget), child.pid ?? null;
}
function spawnDaemonProcess(projectsRoot) {
  spawnDetachedEntry(projectsRoot, "sync-daemon.mjs", [projectsRoot]);
}

// src/sync/pidfile.ts
import { createHash as createHash11, randomUUID as randomUUID9 } from "node:crypto";
import { chmod as chmod9, mkdir as mkdir21, open as open6, readFile as readFile29, rm as rm19 } from "node:fs/promises";
import { join as join32 } from "node:path";
var FILE2 = "daemon.pid";
async function hashBundle(path2) {
  try {
    return createHash11("sha256").update(await readFile29(path2)).digest("hex");
  } catch {
    return "";
  }
}
async function readPid(daemonDir2) {
  try {
    let data = JSON.parse(await readFile29(join32(daemonDir2, FILE2), "utf8"));
    if (typeof data.pid != "number" || data.script !== "sync-daemon" || typeof data.projectsRoot != "string")
      return null;
    let authIdentityResult = data.authIdentity === void 0 ? null : parseDaemonAuthMarkerIdentity(data.authIdentity), authIdentity = authIdentityResult?.ok === !0 ? authIdentityResult.identity : void 0;
    return {
      pid: data.pid,
      script: "sync-daemon",
      projectsRoot: data.projectsRoot,
      startedAt: typeof data.startedAt == "string" ? data.startedAt : "",
      nonce: typeof data.nonce == "string" ? data.nonce : "",
      version: typeof data.version == "string" ? data.version : "0.0.0",
      codeHash: typeof data.codeHash == "string" ? data.codeHash : "",
      ...authIdentity ? { authIdentity } : {}
    };
  } catch {
    return null;
  }
}
async function removePid(daemonDir2) {
  await rm19(join32(daemonDir2, FILE2), { force: !0 });
}
function isAlive2(pid) {
  try {
    return process.kill(pid, 0), !0;
  } catch (err) {
    return err.code === "EPERM";
  }
}
function isOwnedDaemon(record, projectsRoot) {
  return !!(record && record.script === "sync-daemon" && record.projectsRoot === projectsRoot);
}

// src/sync/stop-daemon.ts
import { join as join33 } from "node:path";
var STOP_POLL_INTERVAL_MS = 100;
async function stopOwnedDaemon(projectsRoot, deps = {}) {
  let daemonDir2 = join33(projectsRoot, ".daemon"), isAlive3 = deps.isAlive ?? isAlive2, readPid2 = deps.readPid ?? readPid, kill = deps.kill ?? ((pid, signal) => process.kill(pid, signal)), sleep3 = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))), initial = await readPid2(daemonDir2);
  if (!isOwnedDaemon(initial, projectsRoot) || !isAlive3(initial.pid))
    return await removePid(daemonDir2), { stopped: !0, reason: "not-running" };
  let beforeTerm = await readPid2(daemonDir2);
  if (!beforeTerm || beforeTerm.pid !== initial.pid || beforeTerm.nonce !== initial.nonce)
    return { stopped: !1, reason: "pidfile-changed" };
  try {
    await kill(initial.pid, "SIGTERM");
  } catch {
    let afterFail = await readPid2(daemonDir2);
    return afterFail && afterFail.pid === initial.pid && afterFail.nonce === initial.nonce && !isAlive3(initial.pid) ? (await removePid(daemonDir2), { stopped: !0, reason: "stopped" }) : { stopped: !1, reason: "signal-failed" };
  }
  let termPolls = Math.ceil(8e3 / STOP_POLL_INTERVAL_MS);
  for (let i = 0; i < termPolls && isAlive3(initial.pid); i++)
    await sleep3(STOP_POLL_INTERVAL_MS);
  let beforeKill = await readPid2(daemonDir2);
  if (beforeKill !== null && (beforeKill.pid !== initial.pid || beforeKill.nonce !== initial.nonce))
    return { stopped: !1, reason: "pidfile-changed" };
  if (isAlive3(initial.pid)) {
    try {
      await kill(initial.pid, "SIGKILL");
    } catch {
    }
    let killPolls = Math.ceil(2e3 / STOP_POLL_INTERVAL_MS);
    for (let i = 0; i < killPolls && isAlive3(initial.pid); i++)
      await sleep3(STOP_POLL_INTERVAL_MS);
  }
  if (!!isAlive3(initial.pid))
    return { stopped: !1, reason: "timeout" };
  let finalRecord = await readPid2(daemonDir2);
  return finalRecord && finalRecord.pid === initial.pid && finalRecord.nonce === initial.nonce && await removePid(daemonDir2), { stopped: !0, reason: "stopped" };
}

// src/sync/ensure-daemon.ts
function compareVersions(a, b) {
  let pa = a.split(".").map((n) => parseInt(n, 10) || 0), pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    let d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
async function supersedeDaemon(pid, deps) {
  try {
    deps.kill(pid, "SIGTERM");
  } catch {
    return !0;
  }
  let maxPolls = Math.ceil(8e3 / 100);
  for (let i = 0; i < maxPolls; i++) {
    if (!deps.isAlive(pid)) return !0;
    await deps.sleep(100);
  }
  if (!deps.isAlive(pid)) return !0;
  try {
    deps.kill(pid, "SIGKILL");
  } catch {
    return !0;
  }
  let killPolls = Math.ceil(2e3 / 100);
  for (let i = 0; i < killPolls; i++) {
    if (!deps.isAlive(pid)) return !0;
    await deps.sleep(100);
  }
  return !deps.isAlive(pid);
}
function daemonScriptPath() {
  return join34(new URL(".", import.meta.url).pathname, "sync-daemon.mjs");
}
async function defaultBundleInfo() {
  let path2 = daemonScriptPath();
  try {
    let [codeHash, st] = await Promise.all([hashBundle(path2), stat9(path2)]);
    return { codeHash, mtimeMs: st.mtimeMs };
  } catch {
    return { codeHash: "", mtimeMs: 0 };
  }
}
function defaultSpawn(opts) {
  spawnDaemonProcess(opts.projectsRoot);
}
async function ensureDaemonInternal(cwd = process.cwd(), deps = {}) {
  let projectsRoot = await (deps.resolveProjectsRoot ?? (async () => getProjectsDir()))(), authUrl = AUTH_URL, providerAvailable = deps.expectedAuthIdentity !== void 0 ? !0 : await (deps.hasAuthProvider ?? hasDaemonAuthProvider)({
    projectsRoot,
    authUrl
  }), analyticsEnabled = deps.analyticsEnabled ?? readDaemonAnalyticsEnv().enabled;
  if (!providerAvailable && !analyticsEnabled) return { kind: "not-needed" };
  let daemonDir2 = join34(projectsRoot, ".daemon"), pidPath = join34(daemonDir2, "daemon.pid"), isAlive3 = deps.isAlive ?? isAlive2, record = await (deps.readPid ?? readPid)(daemonDir2);
  if (isOwnedDaemon(record, projectsRoot) && isAlive3(record.pid)) {
    let expectedIdentity;
    if (deps.expectedAuthIdentity !== void 0)
      expectedIdentity = deps.expectedAuthIdentity;
    else if (deps.readExpectedAuthIdentity) {
      let result = await deps.readExpectedAuthIdentity(projectsRoot);
      if (!result.ok) return { kind: "malformed-auth-identity" };
      expectedIdentity = result.marker;
    } else {
      let authResult = await readCurrentDaemonAuthIdentity(projectsRoot);
      if (!authResult.ok) return { kind: "malformed-auth-identity" };
      authResult.identity.providerKind !== "none" && (expectedIdentity = toDaemonAuthMarkerIdentity(authResult.identity));
    }
    if (expectedIdentity !== void 0) {
      let runningIdentity = record.authIdentity;
      return runningIdentity === void 0 ? (await (deps.stopDaemon ?? stopOwnedDaemon)(projectsRoot, {
        isAlive: deps.isAlive,
        kill: deps.kill,
        sleep: deps.sleep,
        readPid: deps.readPid
      })).stopped ? ((deps.spawnDaemon ?? defaultSpawn)({ pidPath, projectsRoot }), { kind: "legacy-unbound-and-replaced" }) : { kind: "legacy-unbound-could-not-stop" } : authIdentitiesEqual(expectedIdentity, runningIdentity) ? { kind: "matched-and-adopted" } : (await (deps.stopDaemon ?? stopOwnedDaemon)(projectsRoot, {
        isAlive: deps.isAlive,
        kill: deps.kill,
        sleep: deps.sleep,
        readPid: deps.readPid
      })).stopped ? ((deps.spawnDaemon ?? defaultSpawn)({ pidPath, projectsRoot }), { kind: "mismatched-and-replaced" }) : { kind: "mismatched-and-could-not-stop" };
    }
    let mine = deps.skillVersion ?? SKILL_VERSION, versionCmp = compareVersions(mine, record.version), supersede = versionCmp > 0;
    if (versionCmp === 0) {
      let onDisk = await (deps.bundleInfo ?? defaultBundleInfo)(), startedAtMs = Date.parse(record.startedAt);
      supersede = onDisk.codeHash !== "" && onDisk.codeHash !== record.codeHash && startedAtMs > 0 && onDisk.mtimeMs > startedAtMs;
    }
    return supersede ? await supersedeDaemon(record.pid, {
      kill: deps.kill ?? ((pid, sig) => process.kill(pid, sig)),
      isAlive: isAlive3,
      sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    }) ? ((deps.spawnDaemon ?? defaultSpawn)({ pidPath, projectsRoot }), { kind: "superseded-by-version-or-code" }) : { kind: "supersede-could-not-stop" } : { kind: "matched-and-adopted" };
  }
  return (deps.spawnDaemon ?? defaultSpawn)({ pidPath, projectsRoot }), { kind: "spawned" };
}
async function ensureDaemon(_cwd = process.cwd(), deps = {}) {
  try {
    await ensureDaemonInternal(_cwd, deps);
  } catch {
  }
}

// src/entries/move.ts
await ensureDaemon();
await main(["move", ...process.argv.slice(2)]);
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.1 https://github.com/nodeca/js-yaml @license MIT *)
*/
