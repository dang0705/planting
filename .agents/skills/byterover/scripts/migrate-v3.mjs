#!/usr/bin/env node
import{createRequire as __cr}from'module';const require=__cr(import.meta.url);
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
};

// src/migrate-v3.ts
import { cp, mkdir as mkdir8, readFile as readFile8, readdir, rm as rm9, stat as stat3, writeFile as writeFile8 } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import path from "node:path";

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
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`, opts2 = [];
  return opts2.push(args.local ? "Z?" : "Z"), args.offset && opts2.push("([+-]\\d{2}:?\\d{2})"), regex = `${regex}(${opts2.join("|")})`, new RegExp(`^${regex}$`);
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
var CODE_POINTS;
(function(CODE_POINTS2) {
  CODE_POINTS2[CODE_POINTS2.EOF = -1] = "EOF", CODE_POINTS2[CODE_POINTS2.NULL = 0] = "NULL", CODE_POINTS2[CODE_POINTS2.TABULATION = 9] = "TABULATION", CODE_POINTS2[CODE_POINTS2.CARRIAGE_RETURN = 13] = "CARRIAGE_RETURN", CODE_POINTS2[CODE_POINTS2.LINE_FEED = 10] = "LINE_FEED", CODE_POINTS2[CODE_POINTS2.FORM_FEED = 12] = "FORM_FEED", CODE_POINTS2[CODE_POINTS2.SPACE = 32] = "SPACE", CODE_POINTS2[CODE_POINTS2.EXCLAMATION_MARK = 33] = "EXCLAMATION_MARK", CODE_POINTS2[CODE_POINTS2.QUOTATION_MARK = 34] = "QUOTATION_MARK", CODE_POINTS2[CODE_POINTS2.AMPERSAND = 38] = "AMPERSAND", CODE_POINTS2[CODE_POINTS2.APOSTROPHE = 39] = "APOSTROPHE", CODE_POINTS2[CODE_POINTS2.HYPHEN_MINUS = 45] = "HYPHEN_MINUS", CODE_POINTS2[CODE_POINTS2.SOLIDUS = 47] = "SOLIDUS", CODE_POINTS2[CODE_POINTS2.DIGIT_0 = 48] = "DIGIT_0", CODE_POINTS2[CODE_POINTS2.DIGIT_9 = 57] = "DIGIT_9", CODE_POINTS2[CODE_POINTS2.SEMICOLON = 59] = "SEMICOLON", CODE_POINTS2[CODE_POINTS2.LESS_THAN_SIGN = 60] = "LESS_THAN_SIGN", CODE_POINTS2[CODE_POINTS2.EQUALS_SIGN = 61] = "EQUALS_SIGN", CODE_POINTS2[CODE_POINTS2.GREATER_THAN_SIGN = 62] = "GREATER_THAN_SIGN", CODE_POINTS2[CODE_POINTS2.QUESTION_MARK = 63] = "QUESTION_MARK", CODE_POINTS2[CODE_POINTS2.LATIN_CAPITAL_A = 65] = "LATIN_CAPITAL_A", CODE_POINTS2[CODE_POINTS2.LATIN_CAPITAL_Z = 90] = "LATIN_CAPITAL_Z", CODE_POINTS2[CODE_POINTS2.RIGHT_SQUARE_BRACKET = 93] = "RIGHT_SQUARE_BRACKET", CODE_POINTS2[CODE_POINTS2.GRAVE_ACCENT = 96] = "GRAVE_ACCENT", CODE_POINTS2[CODE_POINTS2.LATIN_SMALL_A = 97] = "LATIN_SMALL_A", CODE_POINTS2[CODE_POINTS2.LATIN_SMALL_Z = 122] = "LATIN_SMALL_Z";
})(CODE_POINTS || (CODE_POINTS = {}));

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/common/error-codes.js
var ERR;
(function(ERR2) {
  ERR2.controlCharacterInInputStream = "control-character-in-input-stream", ERR2.noncharacterInInputStream = "noncharacter-in-input-stream", ERR2.surrogateInInputStream = "surrogate-in-input-stream", ERR2.nonVoidHtmlElementStartTagWithTrailingSolidus = "non-void-html-element-start-tag-with-trailing-solidus", ERR2.endTagWithAttributes = "end-tag-with-attributes", ERR2.endTagWithTrailingSolidus = "end-tag-with-trailing-solidus", ERR2.unexpectedSolidusInTag = "unexpected-solidus-in-tag", ERR2.unexpectedNullCharacter = "unexpected-null-character", ERR2.unexpectedQuestionMarkInsteadOfTagName = "unexpected-question-mark-instead-of-tag-name", ERR2.invalidFirstCharacterOfTagName = "invalid-first-character-of-tag-name", ERR2.unexpectedEqualsSignBeforeAttributeName = "unexpected-equals-sign-before-attribute-name", ERR2.missingEndTagName = "missing-end-tag-name", ERR2.unexpectedCharacterInAttributeName = "unexpected-character-in-attribute-name", ERR2.unknownNamedCharacterReference = "unknown-named-character-reference", ERR2.missingSemicolonAfterCharacterReference = "missing-semicolon-after-character-reference", ERR2.unexpectedCharacterAfterDoctypeSystemIdentifier = "unexpected-character-after-doctype-system-identifier", ERR2.unexpectedCharacterInUnquotedAttributeValue = "unexpected-character-in-unquoted-attribute-value", ERR2.eofBeforeTagName = "eof-before-tag-name", ERR2.eofInTag = "eof-in-tag", ERR2.missingAttributeValue = "missing-attribute-value", ERR2.missingWhitespaceBetweenAttributes = "missing-whitespace-between-attributes", ERR2.missingWhitespaceAfterDoctypePublicKeyword = "missing-whitespace-after-doctype-public-keyword", ERR2.missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers = "missing-whitespace-between-doctype-public-and-system-identifiers", ERR2.missingWhitespaceAfterDoctypeSystemKeyword = "missing-whitespace-after-doctype-system-keyword", ERR2.missingQuoteBeforeDoctypePublicIdentifier = "missing-quote-before-doctype-public-identifier", ERR2.missingQuoteBeforeDoctypeSystemIdentifier = "missing-quote-before-doctype-system-identifier", ERR2.missingDoctypePublicIdentifier = "missing-doctype-public-identifier", ERR2.missingDoctypeSystemIdentifier = "missing-doctype-system-identifier", ERR2.abruptDoctypePublicIdentifier = "abrupt-doctype-public-identifier", ERR2.abruptDoctypeSystemIdentifier = "abrupt-doctype-system-identifier", ERR2.cdataInHtmlContent = "cdata-in-html-content", ERR2.incorrectlyOpenedComment = "incorrectly-opened-comment", ERR2.eofInScriptHtmlCommentLikeText = "eof-in-script-html-comment-like-text", ERR2.eofInDoctype = "eof-in-doctype", ERR2.nestedComment = "nested-comment", ERR2.abruptClosingOfEmptyComment = "abrupt-closing-of-empty-comment", ERR2.eofInComment = "eof-in-comment", ERR2.incorrectlyClosedComment = "incorrectly-closed-comment", ERR2.eofInCdata = "eof-in-cdata", ERR2.absenceOfDigitsInNumericCharacterReference = "absence-of-digits-in-numeric-character-reference", ERR2.nullCharacterReference = "null-character-reference", ERR2.surrogateCharacterReference = "surrogate-character-reference", ERR2.characterReferenceOutsideUnicodeRange = "character-reference-outside-unicode-range", ERR2.controlCharacterReference = "control-character-reference", ERR2.noncharacterCharacterReference = "noncharacter-character-reference", ERR2.missingWhitespaceBeforeDoctypeName = "missing-whitespace-before-doctype-name", ERR2.missingDoctypeName = "missing-doctype-name", ERR2.invalidCharacterSequenceAfterDoctypeName = "invalid-character-sequence-after-doctype-name", ERR2.duplicateAttribute = "duplicate-attribute", ERR2.nonConformingDoctype = "non-conforming-doctype", ERR2.missingDoctype = "missing-doctype", ERR2.misplacedDoctype = "misplaced-doctype", ERR2.endTagWithoutMatchingOpenElement = "end-tag-without-matching-open-element", ERR2.closingOfElementWithOpenChildElements = "closing-of-element-with-open-child-elements", ERR2.disallowedContentInNoscriptInHead = "disallowed-content-in-noscript-in-head", ERR2.openElementsLeftAfterEof = "open-elements-left-after-eof", ERR2.abandonedHeadElementChild = "abandoned-head-element-child", ERR2.misplacedStartTagForHeadElement = "misplaced-start-tag-for-head-element", ERR2.nestedNoscriptInHead = "nested-noscript-in-head", ERR2.eofInElementThatCanContainOnlyText = "eof-in-element-that-can-contain-only-text";
})(ERR || (ERR = {}));

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/common/token.js
var TokenType;
(function(TokenType2) {
  TokenType2[TokenType2.CHARACTER = 0] = "CHARACTER", TokenType2[TokenType2.NULL_CHARACTER = 1] = "NULL_CHARACTER", TokenType2[TokenType2.WHITESPACE_CHARACTER = 2] = "WHITESPACE_CHARACTER", TokenType2[TokenType2.START_TAG = 3] = "START_TAG", TokenType2[TokenType2.END_TAG = 4] = "END_TAG", TokenType2[TokenType2.COMMENT = 5] = "COMMENT", TokenType2[TokenType2.DOCTYPE = 6] = "DOCTYPE", TokenType2[TokenType2.EOF = 7] = "EOF", TokenType2[TokenType2.HIBERNATION = 8] = "HIBERNATION";
})(TokenType || (TokenType = {}));

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/common/html.js
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
]), SCOPING_ELEMENTS_HTML_LIST = /* @__PURE__ */ new Set([...SCOPING_ELEMENTS_HTML, TAG_ID.OL, TAG_ID.UL]), SCOPING_ELEMENTS_HTML_BUTTON = /* @__PURE__ */ new Set([...SCOPING_ELEMENTS_HTML, TAG_ID.BUTTON]), SCOPING_ELEMENTS_MATHML = /* @__PURE__ */ new Set([TAG_ID.ANNOTATION_XML, TAG_ID.MI, TAG_ID.MN, TAG_ID.MO, TAG_ID.MS, TAG_ID.MTEXT]), SCOPING_ELEMENTS_SVG = /* @__PURE__ */ new Set([TAG_ID.DESC, TAG_ID.FOREIGN_OBJECT, TAG_ID.TITLE]), TABLE_ROW_CONTEXT = /* @__PURE__ */ new Set([TAG_ID.TR, TAG_ID.TEMPLATE, TAG_ID.HTML]), TABLE_BODY_CONTEXT = /* @__PURE__ */ new Set([TAG_ID.TBODY, TAG_ID.TFOOT, TAG_ID.THEAD, TAG_ID.TEMPLATE, TAG_ID.HTML]), TABLE_CONTEXT = /* @__PURE__ */ new Set([TAG_ID.TABLE, TAG_ID.TEMPLATE, TAG_ID.HTML]), TABLE_CELLS = /* @__PURE__ */ new Set([TAG_ID.TD, TAG_ID.TH]);

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/parser/formatting-element-list.js
var EntryType;
(function(EntryType2) {
  EntryType2[EntryType2.Marker = 0] = "Marker", EntryType2[EntryType2.Element = 1] = "Element";
})(EntryType || (EntryType = {}));
var MARKER = { type: EntryType.Marker };

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/common/doctype.js
var QUIRKS_MODE_PUBLIC_ID_PREFIXES = [
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
];
var LIMITED_QUIRKS_PUBLIC_ID_PREFIXES = ["-//w3c//dtd xhtml 1.0 frameset//", "-//w3c//dtd xhtml 1.0 transitional//"], LIMITED_QUIRKS_WITH_SYSTEM_ID_PUBLIC_ID_PREFIXES = [
  ...LIMITED_QUIRKS_PUBLIC_ID_PREFIXES,
  "-//w3c//dtd html 4.01 frameset//",
  "-//w3c//dtd html 4.01 transitional//"
];

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/common/foreign-content.js
var SVG_ATTRS_ADJUSTMENT_MAP = new Map([
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

// ../../node_modules/.pnpm/parse5@8.0.1/node_modules/parse5/dist/parser/index.js
var InsertionMode;
(function(InsertionMode2) {
  InsertionMode2[InsertionMode2.INITIAL = 0] = "INITIAL", InsertionMode2[InsertionMode2.BEFORE_HTML = 1] = "BEFORE_HTML", InsertionMode2[InsertionMode2.BEFORE_HEAD = 2] = "BEFORE_HEAD", InsertionMode2[InsertionMode2.IN_HEAD = 3] = "IN_HEAD", InsertionMode2[InsertionMode2.IN_HEAD_NO_SCRIPT = 4] = "IN_HEAD_NO_SCRIPT", InsertionMode2[InsertionMode2.AFTER_HEAD = 5] = "AFTER_HEAD", InsertionMode2[InsertionMode2.IN_BODY = 6] = "IN_BODY", InsertionMode2[InsertionMode2.TEXT = 7] = "TEXT", InsertionMode2[InsertionMode2.IN_TABLE = 8] = "IN_TABLE", InsertionMode2[InsertionMode2.IN_TABLE_TEXT = 9] = "IN_TABLE_TEXT", InsertionMode2[InsertionMode2.IN_CAPTION = 10] = "IN_CAPTION", InsertionMode2[InsertionMode2.IN_COLUMN_GROUP = 11] = "IN_COLUMN_GROUP", InsertionMode2[InsertionMode2.IN_TABLE_BODY = 12] = "IN_TABLE_BODY", InsertionMode2[InsertionMode2.IN_ROW = 13] = "IN_ROW", InsertionMode2[InsertionMode2.IN_CELL = 14] = "IN_CELL", InsertionMode2[InsertionMode2.IN_SELECT = 15] = "IN_SELECT", InsertionMode2[InsertionMode2.IN_SELECT_IN_TABLE = 16] = "IN_SELECT_IN_TABLE", InsertionMode2[InsertionMode2.IN_TEMPLATE = 17] = "IN_TEMPLATE", InsertionMode2[InsertionMode2.AFTER_BODY = 18] = "AFTER_BODY", InsertionMode2[InsertionMode2.IN_FRAMESET = 19] = "IN_FRAMESET", InsertionMode2[InsertionMode2.AFTER_FRAMESET = 20] = "AFTER_FRAMESET", InsertionMode2[InsertionMode2.AFTER_AFTER_BODY = 21] = "AFTER_AFTER_BODY", InsertionMode2[InsertionMode2.AFTER_AFTER_FRAMESET = 22] = "AFTER_AFTER_FRAMESET";
})(InsertionMode || (InsertionMode = {}));
var TABLE_STRUCTURE_TAGS = /* @__PURE__ */ new Set([TAG_ID.TABLE, TAG_ID.TBODY, TAG_ID.TFOOT, TAG_ID.THEAD, TAG_ID.TR]);
var TABLE_VOID_ELEMENTS = /* @__PURE__ */ new Set([TAG_ID.CAPTION, TAG_ID.COL, TAG_ID.COLGROUP, TAG_ID.TBODY, TAG_ID.TD, TAG_ID.TFOOT, TAG_ID.TH, TAG_ID.THEAD, TAG_ID.TR]);

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

// ../../packages/storage/src/cas-atomic-write.ts
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
var RENAME_RETRY_DELAYS_MS = [10, 25, 50, 100, 200];
async function renameWithRetry(tmp, filePath) {
  for (let delayMs of RENAME_RETRY_DELAYS_MS)
    try {
      await rename(tmp, filePath);
      return;
    } catch (err) {
      let code = err.code;
      if (code !== "EPERM" && code !== "EACCES") throw err;
      await new Promise((resolve3) => setTimeout(resolve3, delayMs));
    }
  await rename(tmp, filePath);
}

// ../../packages/core/src/tree/paths.ts
import { homedir, platform } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

// ../../packages/core/src/identity/uuid-v4.ts
import { randomUUID } from "node:crypto";
var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function uuidv4(rng = randomUUID) {
  return rng();
}
function isUuid(value) {
  return typeof value == "string" && UUID_REGEX.test(value);
}

// ../../packages/core/src/tree/paths.ts
var CONTEXT_TREE_DIRNAME = "context-tree";
var PROJECTS_DIRNAME = "projects", GLOBAL_DATA_DIRNAME = "brv";
function getGlobalDataDir() {
  let override = process.env.BRV_DATA_DIR;
  if (override) return override;
  let dirName = process.env.BRV_DATA_DIRNAME?.trim() || GLOBAL_DATA_DIRNAME, currentPlatform = platform();
  if (currentPlatform === "win32") {
    let localAppData = process.env.LOCALAPPDATA;
    return localAppData !== void 0 ? join(localAppData, dirName) : join(homedir(), "AppData", "Local", dirName);
  }
  if (currentPlatform === "darwin")
    return join(homedir(), "Library", "Application Support", dirName);
  if (currentPlatform === "linux") {
    let xdgDataHome = process.env.XDG_DATA_HOME;
    if (xdgDataHome && isAbsolute(xdgDataHome))
      return join(xdgDataHome, dirName);
  }
  return join(homedir(), ".local", "share", dirName);
}
function getProjectsDir() {
  return join(getGlobalDataDir(), PROJECTS_DIRNAME);
}
function spaceContextTreePath(space_id) {
  return join(
    getGlobalDataDir(),
    PROJECTS_DIRNAME,
    space_id,
    CONTEXT_TREE_DIRNAME
  );
}
function resolveWithinTree(root, relPath) {
  let base = resolve(root), resolved = resolve(base, relPath);
  if (resolved !== base && !resolved.startsWith(base + sep))
    throw new Error(`Path escapes context-tree root: ${relPath}`);
  return resolved;
}

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
var ATTR_VALUE_GRAMMAR = `("[^"]*"|'[^']*'|[^\\s"'=<>\`]+)`;
function setBvTopicAttribute(html, name, value) {
  let match = matchBvTopicOpenTag(html);
  if (!match) return html;
  let { index, tag } = match, escaped = escapeHtmlAttributeValue(value), attrPattern = new RegExp(
    `\\s${name}\\s*=\\s*${ATTR_VALUE_GRAMMAR}`,
    "gi"
  ), replaced = !1, newTag = tag.replace(attrPattern, () => replaced ? "" : (replaced = !0, ` ${name}="${escaped}"`));
  return replaced || (newTag = tag.endsWith("/>") ? `${tag.slice(0, -2)} ${name}="${escaped}"/>` : `${tag.slice(0, -1)} ${name}="${escaped}">`), html.slice(0, index) + newTag + html.slice(index + tag.length);
}

// ../../packages/core/src/identity/topic-id.ts
import { randomUUID as randomUUID2 } from "node:crypto";
var ID_PREFIX = "tpc_";
function makeTopicId(rng = randomUUID2) {
  return `${ID_PREFIX}${rng().replaceAll("-", "")}`;
}
function ensureTopicId(html, makeId = makeTopicId) {
  let existing = readTopicRootAttribute(html, "id");
  if (existing !== void 0 && existing.length > 0)
    return { created: !1, html, id: existing };
  let id = makeId();
  return { created: !0, html: patchBvTopicRootAttributes(html, { id }), id };
}

// ../../packages/core/src/render/materialize-layer.ts
function oneOf(...allowed) {
  let set2 = new Set(allowed);
  return (value) => set2.has(value) ? value : void 0;
}
var TOPIC_TYPE = oneOf("topic", "summary", "context"), TOPIC_VISIBILITY = oneOf("public", "restricted"), FACT_DISCLOSURE = oneOf("public", "restricted"), FACT_CATEGORY = oneOf(
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
);
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

// ../../packages/core/src/scoring/runtime-signals.ts
var DEFAULT_IMPORTANCE = 50, DEFAULT_RECENCY = 1, DEFAULT_MATURITY = "draft", DEFAULT_ACCESS_COUNT = 0, DEFAULT_UPDATE_COUNT = 0, MaturityTierSchema = external_exports.enum(["core", "draft", "validated"]), RuntimeSignalsSchema = external_exports.object({
  accessCount: external_exports.number().int().nonnegative().default(DEFAULT_ACCESS_COUNT),
  importance: external_exports.number().min(0).max(100).default(DEFAULT_IMPORTANCE),
  maturity: MaturityTierSchema.default(DEFAULT_MATURITY),
  recency: external_exports.number().min(0).max(1).default(DEFAULT_RECENCY),
  updateCount: external_exports.number().int().nonnegative().default(DEFAULT_UPDATE_COUNT)
});

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
function testImplicitResolving(state, str2) {
  var index, length, type2;
  for (index = 0, length = state.implicitTypes.length; index < length; index += 1)
    if (type2 = state.implicitTypes[index], type2.resolve(str2))
      return !0;
  return !1;
}
function isWhitespace(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}
function isPrintable(c) {
  return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
  return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c), cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
  return (
    // ns-plain-safe
    (inblock ? (
      // c = flow-in
      cIsNsCharOrWhitespace
    ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
  );
}
function isPlainSafeFirst(c) {
  return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeLast(c) {
  return !isWhitespace(c) && c !== CHAR_COLON;
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
function escapeText(text) {
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
    trimmed.length > 0 ? parts.push(`<bv-fact>${escapeText(trimmed)}</bv-fact>`) : warnings.push("Topic body is empty after frontmatter.");
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
    pre.length > 0 && (parts.unshift(`<bv-fact>${escapeText(pre)}</bv-fact>`), warnings.push(
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
  trimmed.length > 0 && parts.push(`<${tag}>${escapeText(trimmed)}</${tag}>`);
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
  prose.length > 0 && (parts.push(`<bv-fact>${escapeText(prose)}</bv-fact>`), warnings.push(
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
  return subject && subject.length > 0 && attrParts.push(` subject="${escapeHtmlAttributeValue(subject)}"`), category && attrParts.push(` category="${category}"`), `<bv-fact${attrParts.join("")}>${escapeText(statement)}</bv-fact>`;
}
function normalizeCategory(raw) {
  if (raw === void 0) return;
  let lower = raw.toLowerCase();
  return FACT_CATEGORIES.has(lower) ? lower : "other";
}
function emitRawConcept(parts, body, warnings) {
  let { fields, preamble } = splitLabeledFields(body), pre = preamble.trim();
  pre.length > 0 && parts.push(`<bv-fact>${escapeText(pre)}</bv-fact>`);
  for (let field of fields) {
    let key = RAW_CONCEPT_LABELS.get(field.label.toLowerCase());
    if (key === void 0) {
      let text = field.body.trim(), combined = text.length > 0 ? `${field.label}: ${text}` : field.label;
      parts.push(`<bv-fact>${escapeText(combined)}</bv-fact>`), warnings.push(`dropped-raw-concept-label:${field.label} (preserved as <bv-fact>)`);
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
  let lis = items.map((i) => `<li>${escapeText(i)}</li>`).join("");
  parts.push(`<${tag}>${lis}</${tag}>`), preserveStrayProse(parts, body, warnings, tag);
}
function emitPatterns(parts, body, warnings) {
  for (let item of bulletItems(body)) {
    let m = /^`(.+?)`(?:\s*\(flags:\s*([^)]*)\))?(?:\s*-\s*(.+))?$/.exec(item);
    if (m && m[1] !== void 0) {
      let attrParts = [], flags = (m[2] ?? "").trim(), desc = (m[3] ?? "").trim();
      flags.length > 0 && attrParts.push(` flags="${escapeHtmlAttributeValue(flags)}"`), desc.length > 0 && attrParts.push(` description="${escapeHtmlAttributeValue(desc)}"`), parts.push(`<bv-pattern${attrParts.join("")}>${escapeText(m[1])}</bv-pattern>`);
    } else
      parts.push(`<bv-pattern>${escapeText(item)}</bv-pattern>`);
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
      `<bv-rule severity="${severity}" id="${escapeHtmlAttributeValue(id)}">${escapeText(item)}</bv-rule>`
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
    parts.push(`<bv-diagram type="${type2}">${escapeText(content)}</bv-diagram>`);
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
    parts.push(`<bv-decision>${escapeText(item)}</bv-decision>`);
  preserveStrayProse(parts, body, warnings, "Decisions");
}
function emitOrphan(parts, heading, body, ruleIds, warnings) {
  let strategy = ORPHAN_H2.get(heading.toLowerCase()), trimmed = body.trim();
  if (strategy === void 0) {
    trimmed.length > 0 && (parts.push(`<bv-fact>${escapeText(trimmed)}</bv-fact>`), warnings.push(
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
        parts.push(`<bv-pattern>${escapeText(item)}</bv-pattern>`);
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

// ../../packages/core/src/migrate/materialize-space.ts
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir as mkdir3, readFile as readFile3, rename as rename4, rm as rm4, writeFile as writeFile3 } from "node:fs/promises";
import { dirname as dirname2, join as join4 } from "node:path";

// ../../packages/core/src/tree/bindings-registry.ts
import { randomBytes } from "node:crypto";
import {
  chmod as chmod2,
  lstat,
  mkdir as mkdir2,
  open,
  readFile,
  rename as rename2,
  rm as rm2
} from "node:fs/promises";
import { join as join2, resolve as resolve2, sep as sep2 } from "node:path";
var BINDINGS_FILENAME = "bindings.json";
function bindingsDir() {
  return getGlobalDataDir();
}
function bindingsPath() {
  return join2(bindingsDir(), BINDINGS_FILENAME);
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
    raw = await readFile(bindingsPath(), "utf8");
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
  await mkdir2(bindingsDir(), { recursive: !0, mode: 448 }), await chmod2(bindingsDir(), 448);
}
function lockPath() {
  return join2(bindingsDir(), `${BINDINGS_FILENAME}.lock`);
}
function tempPath() {
  return join2(
    bindingsDir(),
    `${BINDINGS_FILENAME}.tmp.${process.pid}.${randomBytes(8).toString("hex")}`
  );
}
async function delay(ms) {
  await new Promise((resolve3) => setTimeout(resolve3, ms));
}
async function withRegistryLock(fn) {
  await ensurePrivateBindingsDir();
  let lock = lockPath();
  for (; ; )
    try {
      let handle = await open(lock, "wx", 384);
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, createdAt: Date.now() })
      ), await handle.close();
      break;
    } catch (err) {
      if (!isErrnoCode(err, "EEXIST")) throw err;
      let stat4 = await lstat(lock).catch(() => null);
      if (stat4 && Date.now() - stat4.mtimeMs > LOCK_STALE_MS) {
        await rm2(lock, { force: !0 });
        continue;
      }
      await delay(LOCK_RETRY_MS);
    }
  try {
    return await fn();
  } finally {
    await rm2(lock, { force: !0 });
  }
}
async function writeRegistryAtomic(reg) {
  await ensurePrivateBindingsDir();
  let target = bindingsPath(), tmp = tempPath(), serialized = JSON.stringify(reg, null, 2) + `
`, handle;
  try {
    handle = await open(tmp, "wx", 384), await handle.writeFile(serialized, "utf8"), await handle.sync(), await handle.close(), handle = void 0, await rename2(tmp, target);
  } catch (err) {
    throw await handle?.close().catch(() => {
    }), await rm2(tmp, { force: !0 }).catch(() => {
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
    raw = await readFile(bindingsPath(), "utf8");
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
async function addBinding(folder, space_id) {
  if (!isUuid(space_id))
    throw new Error("addBinding: space_id must be a UUID string");
  let canonicalFolder = resolve2(folder);
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
async function getDefaultSpaceId() {
  return (await readRegistry()).defaultSpaceId ?? null;
}
async function setDefaultSpaceId(space_id) {
  if (!isUuid(space_id))
    throw new Error("setDefaultSpaceId: space_id must be a UUID string");
  await mutateRegistry((reg) => {
    reg.defaultSpaceId = space_id;
  });
}
function isErrnoCode(err, code) {
  return typeof err == "object" && err !== null && "code" in err && err.code === code;
}
function describeErr(err) {
  return err instanceof Error ? err.message : String(err);
}

// ../../packages/core/src/tree/space-metadata.ts
import { randomBytes as randomBytes2 } from "node:crypto";
import { readFile as readFile2, rename as rename3, rm as rm3, writeFile as writeFile2 } from "node:fs/promises";
import { join as join3 } from "node:path";
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
async function writeSpaceMetadata(spaceDir, metadata) {
  validateFields(
    metadata.space_id,
    metadata.space_name,
    metadata.team_id,
    metadata.created_at,
    metadata.team_name
  );
  let target = join3(spaceDir, SPACE_METADATA_FILENAME), tmp = `${target}.tmp.${randomBytes2(6).toString("hex")}`, serialized = `${JSON.stringify(metadata, null, 2)}
`;
  try {
    await writeFile2(tmp, serialized, "utf8"), await rename3(tmp, target);
  } catch (err) {
    throw await rm3(tmp, { force: !0 }).catch(() => {
    }), err;
  }
}

// ../../packages/core/src/migrate/materialize-space.ts
async function materializeMarkdownSpace(opts2) {
  let { spaceId, spaceName, sources } = opts2, teamId = opts2.teamId ?? null, now = opts2.now ?? (/* @__PURE__ */ new Date()).toISOString(), mode = opts2.mode ?? "replace";
  if (!isUuid(spaceId))
    throw new Error(`materializeMarkdownSpace: spaceId must be a UUID (got "${spaceId}")`);
  let treeDir = spaceContextTreePath(spaceId), spaceDir = dirname2(treeDir);
  mode === "replace" ? (await rm4(treeDir, { recursive: !0, force: !0 }), await mkdir3(treeDir, { recursive: !0 }), await writeSpaceMetadata(spaceDir, {
    space_id: spaceId,
    space_name: spaceName,
    team_id: teamId,
    created_at: now
  })) : (await mkdir3(treeDir, { recursive: !0 }), existsSync(join4(spaceDir, SPACE_METADATA_FILENAME)) || await writeSpaceMetadata(spaceDir, {
    space_id: spaceId,
    space_name: spaceName,
    team_id: teamId,
    created_at: now
  }));
  let failures = [], converted = 0, skipped = 0;
  for (let src of sources)
    try {
      let htmlRel = src.relPath.replace(/\.md$/i, ".html"), target = resolveWithinTree(treeDir, htmlRel);
      if (mode === "merge" && existsSync(target)) {
        skipped += 1;
        continue;
      }
      let markdown = await readFile3(src.absPath, "utf8"), { html } = convertMarkdownTopicToHtml({ markdown, relPath: src.relPath, now }), identifiedHtml = ensureTopicId(
        html,
        () => migratedTopicId(spaceId, htmlRel)
      ).html;
      if (await mkdir3(dirname2(target), { recursive: !0 }), mode === "merge") {
        let tmp = `${target}.brvtmp-${process.pid}`;
        await writeFile3(tmp, identifiedHtml, "utf8"), await rename4(tmp, target);
      } else
        await writeFile3(target, identifiedHtml, "utf8");
      converted += 1;
    } catch (err) {
      failures.push({ relPath: src.relPath, reason: err instanceof Error ? err.message : String(err) });
    }
  if ((opts2.registerBinding ?? !0) && opts2.originalFolder)
    try {
      await addBinding(opts2.originalFolder, spaceId);
    } catch {
    }
  if (opts2.setDefaultIfUnset ?? !0)
    try {
      await getDefaultSpaceId() || await setDefaultSpaceId(spaceId);
    } catch {
    }
  return { spaceId, destDir: treeDir, converted, skipped, failures };
}
function migratedTopicId(spaceId, relPath) {
  return `tpc_${createHash("sha256").update(spaceId).update("\0").update(relPath).digest("hex").slice(0, 32)}`;
}

// ../../packages/core/src/dream/candidates.ts
var STALE_DAYS = {
  core: Number.POSITIVE_INFINITY,
  // core topics are never pruned
  draft: 60,
  validated: 120
};

// ../../packages/core/src/citation/format.ts
var MS_PER_DAY = 1440 * 60 * 1e3;

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
import { randomUUID as randomUUID4 } from "node:crypto";
import { join as join7 } from "node:path";

// ../../packages/core/src/analytics/identity.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import { mkdir as mkdir4, open as open2, readFile as readFile4, rm as rm5, stat, writeFile as writeFile4 } from "node:fs/promises";
import { join as join5 } from "node:path";
var CONFIG_FILENAME = "config.json", CONFIG_VERSION = 1;
var MACHINE_ID_KEY = "machine_id";
function configDir() {
  return getGlobalDataDir();
}
function configPath() {
  return join5(configDir(), CONFIG_FILENAME);
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
      let minted = randomUUID3();
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
  return new Promise((resolve3) => setTimeout(resolve3, ms));
}
async function withConfigLock(fn) {
  await mkdir4(configDir(), { recursive: !0 });
  let lockPath2 = `${configPath()}.lock`, ownerId = randomUUID3(), lock, deadline = Date.now() + LOCK_MAX_WAIT_MS;
  for (; ; ) {
    try {
      lock = await open2(lockPath2, "wx");
      break;
    } catch (err) {
      if (!isErrnoCode2(err, "EEXIST")) throw err;
    }
    try {
      let st = await stat(lockPath2);
      if (Date.now() - st.mtimeMs > LOCK_STALE_MS2) {
        await rm5(lockPath2, { force: !0 });
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
      current = await readFile4(lockPath2, "utf8");
    } catch {
      current = void 0;
    }
    current === ownerId && await rm5(lockPath2, { force: !0 }).catch(() => {
    });
  }
}
async function readConfigId(key) {
  let raw;
  try {
    raw = await readFile4(configPath(), "utf8");
  } catch (err) {
    if (isErrnoCode2(err, "ENOENT")) return;
    console.warn(
      `[byterover] Could not read ${configPath()}: ${describeErr2(err)}`
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
  await mkdir4(configDir(), { recursive: !0 });
  let document = {};
  try {
    let raw = await readFile4(configPath(), "utf8"), parsed = JSON.parse(raw);
    isPlainObject(parsed) && (document = parsed);
  } catch {
  }
  let next = {
    ...document,
    [key]: value
  };
  isNonEmptyString(next.createdAt) || (next.createdAt = (/* @__PURE__ */ new Date()).toISOString()), typeof next.version != "number" && typeof next.version != "string" && (next.version = CONFIG_VERSION);
  let serialized = JSON.stringify(next, null, 2) + `
`, target = configPath(), tmp = `${target}.${randomUUID3()}.tmp`;
  try {
    await writeFile4(tmp, serialized, "utf8"), await renameWithRetry(tmp, target);
  } catch (err) {
    throw await rm5(tmp, { force: !0 }).catch(() => {
    }), err;
  }
}
function isErrnoCode2(err, code) {
  return typeof err == "object" && err !== null && "code" in err && err.code === code;
}
function describeErr2(err) {
  return err instanceof Error ? err.message : String(err);
}

// ../../packages/core/src/analytics/bounded-append.ts
import { appendFile, mkdir as mkdir5, readFile as readFile5, rm as rm6, stat as stat2, writeFile as writeFile5 } from "node:fs/promises";
import { dirname as dirname3 } from "node:path";
var MAX_ANALYTICS_BYTES = 50 * 1024 * 1024, COMPACT_TARGET_RATIO = 0.5, compactionChains = /* @__PURE__ */ new Map();
function serializeCompaction(path2, run2) {
  let result = (compactionChains.get(path2) ?? Promise.resolve()).then(run2, run2), tail = result.then(
    () => {
    },
    () => {
    }
  );
  return compactionChains.set(path2, tail), tail.then(() => {
    compactionChains.get(path2) === tail && compactionChains.delete(path2);
  }), result;
}
async function boundedAppendLine(path2, jsonLine, opts2) {
  let maxBytes = opts2?.maxBytes ?? MAX_ANALYTICS_BYTES, line = jsonLine.endsWith(`
`) ? jsonLine : jsonLine + `
`, lineBytes = Buffer.byteLength(line, "utf8");
  try {
    await mkdir5(dirname3(path2), { recursive: !0 });
    let dropped = 0, currentSize = 0;
    try {
      currentSize = (await stat2(path2)).size;
    } catch {
      currentSize = 0;
    }
    if (currentSize + lineBytes > maxBytes) {
      let target = Math.min(
        maxBytes - lineBytes,
        Math.floor(maxBytes * COMPACT_TARGET_RATIO)
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
    raw = await readFile5(path2, "utf8");
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
    await writeFile5(tmp, body, "utf8"), await renameWithRetry(tmp, path2);
  } catch {
    return await rm6(tmp, { force: !0 }).catch(() => {
    }), 0;
  }
  return dropped;
}

// ../../packages/core/src/analytics/shared-state.ts
import { mkdir as mkdir6, readFile as readFile6, rm as rm7, writeFile as writeFile6 } from "node:fs/promises";
import { dirname as dirname4, join as join6 } from "node:path";
var IDENTITY_CURRENT_FILE = "analytics-identity-current.json";
function identityCurrentPath() {
  return join6(getGlobalDataDir(), IDENTITY_CURRENT_FILE);
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
    parsed = JSON.parse(await readFile6(path2, "utf8"));
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
  return join6(getGlobalDataDir(), DAEMON_IDENTITY_FILE);
}
async function readDaemonIdentity(path2 = daemonIdentityPath()) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile6(path2, "utf8"));
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
  return join7(getGlobalDataDir(), PENDING_FILENAME);
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
      id: randomUUID4(),
      name: input.name,
      occurred_at: occurredAt,
      ...observedIdentity !== void 0 ? { observed_identity: observedIdentity } : {},
      ...observedAuthState !== void 0 ? { observed_auth_state: observedAuthState } : {},
      properties
    };
    return PendingRowSchema.parse(row), await boundedAppendLine(pendingFilePath(), JSON.stringify(row), input.bounds), row;
  } catch (err) {
    console.warn(
      `[analytics] dropped pending ${String(input.name)}: ${describeErr3(err)}`
    );
    return;
  }
}
function describeErr3(err) {
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
      `[analytics] dropped ${String(input.name)}: ${describeErr4(err)}`
    );
  }
}
function describeErr4(err) {
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

// ../../packages/sync/src/daemon-auth-store.ts
import {
  createCipheriv,
  createDecipheriv,
  createHash as createHash2,
  randomBytes as randomBytes3
} from "node:crypto";
import { chmod as chmod3, mkdir as mkdir7, readFile as readFile7, rename as rename5, writeFile as writeFile7, rm as rm8 } from "node:fs/promises";
import { basename as basename2, dirname as dirname5, join as join8 } from "node:path";
var DAEMON_AUTH_KEY_BYTES = 32;
var DAEMON_AUTH_KEY_FILENAME = "daemon-auth.key";
function daemonAuthPath(projectsRoot) {
  return join8(projectsRoot, ".daemon", "auth.json");
}
function daemonAuthKeyPath(authPath) {
  let daemonDir = dirname5(authPath), projectsRoot = dirname5(daemonDir), dataRoot = dirname5(projectsRoot);
  return basename2(daemonDir) === ".daemon" && basename2(projectsRoot) === "projects" && dataRoot !== dirname5(dataRoot) ? join8(dataRoot, DAEMON_AUTH_KEY_FILENAME) : join8(daemonDir, "auth.key");
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
    return parseDaemonAuthKey(await readFile7(path2, "utf8"));
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
    let decipher = createDecipheriv(
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
    let raw = await readFile7(path2, "utf8"), record = JSON.parse(raw);
    return isEncryptedDaemonDeviceSession(record) ? decryptDaemonDeviceSession(path2, record) : record.provider === "daemon-device-session" && !isPlaintextDaemonDeviceSession(record) ? null : record;
  } catch {
    return null;
  }
}

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

// src/config.ts
var AUTH_URL = "https://v4-app.byterover.dev";
var ANALYTICS_TELEMETRY_URL = "https://v4-telemetry.byterover.dev", ANALYTICS_ENABLED = ANALYTICS_TELEMETRY_URL.length > 0, rawMaxBytes = 0, EVENT_MAX_BYTES = Number.isInteger(rawMaxBytes) && rawMaxBytes > 0 ? rawMaxBytes : 4096, rawCapabilityRefresh = "", CAPABILITY_REFRESH_ENABLED = !["0", "false", "off"].includes(
  rawCapabilityRefresh.trim().toLowerCase()
);

// src/migrate-v3.ts
function parseFlags(argv) {
  let get = (n) => {
    let i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : void 0;
  }, has = (n) => argv.includes(n), all = (n) => {
    let out = [];
    for (let i = 0; i < argv.length; i++)
      argv[i] === n && argv[i + 1] && out.push(argv[i + 1]);
    return out;
  }, cmd = argv.find((a) => !a.startsWith("--")) ?? "help", roots = all("--scan-root");
  return {
    command: ["detect", "run", "verify", "cleanup", "help"].includes(cmd) ? cmd : "help",
    roots: roots.length ? roots : [homedir2()],
    projects: all("--project"),
    team: get("--team") ?? null,
    spaceType: get("--space-type") === "personal" ? "personal" : "team",
    apiKey: get("--api-key") ?? null,
    apiKeyFile: get("--api-key-file") ?? null,
    dryRun: has("--dry-run"),
    yes: has("--yes"),
    backupDir: get("--backup-dir") ?? null,
    authUrl: get("--auth-url") ?? AUTH_URL,
    maxDepth: Number(get("--max-depth") ?? "8") || 8
  };
}
var log = (line) => void process.stderr.write(`${line}
`), MigrationError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
async function resolveBearer(opts2) {
  if (opts2.apiKeyFile) return (await readFile8(opts2.apiKeyFile, "utf8")).trim();
  if (opts2.apiKey) return opts2.apiKey.trim();
  try {
    let stored = await readDaemonAuth(daemonAuthPath(getProjectsDir()));
    if (!stored) throw new Error("missing auth");
    if (stored.provider === "api-key" && stored.apiKey) return stored.apiKey;
    if (stored.provider === "daemon-device-session" && stored.refreshToken)
      return stored.refreshToken;
  } catch {
  }
  throw new MigrationError(
    "not_authenticated",
    "Not signed in. Run `node scripts/auth.mjs` (device login) or `node scripts/auth.mjs --key-file key`, or pass `--api-key-file <path>`."
  );
}
async function webRequest(opts2, apiKey, pathname, init = {}) {
  let res;
  try {
    res = await fetch(`${opts2.authUrl}${pathname}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        ...init.headers ?? {}
      }
    });
  } catch (err) {
    throw new MigrationError(
      "network_error",
      `Could not reach ${opts2.authUrl}${pathname} (${err instanceof Error ? err.message : String(err)}). Check the VPS network / --auth-url.`
    );
  }
  if (res.status === 401)
    throw new MigrationError(
      "auth_rejected",
      `Server rejected the API key (401) for ${pathname}. Re-run the auth step, or check the key has access.`
    );
  return res;
}
async function resolveTeamId(opts2, apiKey) {
  if (opts2.team) return opts2.team;
  let res = await webRequest(opts2, apiKey, "/api/teams");
  if (!res.ok)
    throw new MigrationError("teams_failed", `Could not list teams (${res.status}). Pass --team <id>.`);
  let teams = (await res.json().catch(() => null))?.teams ?? [];
  if (teams.length === 0)
    throw new MigrationError(
      "no_team",
      "No team found for this account. Create one in the ByteRover desktop app, or pass --team <id>."
    );
  let pick = teams.find((t) => t.role === "OWNER" || t.role === "ADMIN") ?? teams[0];
  if (!pick) throw new MigrationError("no_team", "No usable team. Pass --team <id>.");
  return pick.id;
}
async function createSpace(opts2, apiKey, teamId, input) {
  let res = await webRequest(opts2, apiKey, `/api/teams/${teamId}/spaces`, {
    method: "POST",
    body: JSON.stringify({ id: input.id, name: input.name, type: opts2.spaceType })
  });
  if (res.status === 403)
    throw new MigrationError(
      "space_forbidden",
      `Not allowed to create a "${opts2.spaceType}" space in team ${teamId}. Try --space-type personal, or --team <a team you own>.`
    );
  if (!(res.status === 200 || res.status === 201)) {
    let text = await res.text().catch(() => "");
    throw new MigrationError(
      "create_space_failed",
      `createSpace failed (${res.status}) for "${input.name}": ${text.slice(0, 160)}`
    );
  }
  let body = await res.json().catch(() => null);
  if (!body?.id)
    throw new MigrationError("create_space_failed", `createSpace returned no id for "${input.name}".`);
  return body.id;
}
var SKIP_DIRS = /* @__PURE__ */ new Set([
  ".git",
  ".Trash",
  ".cache",
  "node_modules",
  "dist",
  "build",
  "out",
  "Library",
  "Applications",
  ".npm",
  ".pnpm-store",
  "venv",
  ".venv"
]);
async function collectMarkdown(treeRoot, dir = treeRoot, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: !0 });
  } catch {
    return out;
  }
  for (let e of entries) {
    let abs = path.join(dir, e.name);
    e.isDirectory() ? await collectMarkdown(treeRoot, abs, out) : e.isFile() && e.name.toLowerCase().endsWith(".md") && out.push({ relPath: path.relative(treeRoot, abs), absPath: abs });
  }
  return out;
}
async function isDir(p) {
  try {
    return (await stat3(p)).isDirectory();
  } catch {
    return !1;
  }
}
async function asProject(projectRoot) {
  let treeRoot = path.join(projectRoot, ".brv", "context-tree");
  if (!await isDir(treeRoot)) return null;
  let sources = await collectMarkdown(treeRoot);
  return sources.length === 0 ? null : { projectRoot, contextTreeRoot: treeRoot, name: path.basename(projectRoot), sources };
}
async function scanV3Projects(opts2) {
  if (opts2.projects.length)
    return (await Promise.all(opts2.projects.map((p) => asProject(path.resolve(p))))).filter((p) => p !== null);
  let seen = /* @__PURE__ */ new Set(), projects = [], walk = async (dir, depth) => {
    if (depth > opts2.maxDepth || seen.has(dir)) return;
    seen.add(dir);
    let proj = await asProject(dir);
    proj && projects.push(proj);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: !0 });
    } catch {
      return;
    }
    for (let e of entries)
      e.isDirectory() && (e.name.startsWith(".") || SKIP_DIRS.has(e.name) || await walk(path.join(dir, e.name), depth + 1));
  };
  for (let root of opts2.roots) await walk(path.resolve(root), 0);
  return projects;
}
var markerFile = () => path.join(getGlobalDataDir(), "desktop-migrations.json"), localKey = (teamId, projectRoot) => `local:${teamId}:${projectRoot}`;
async function readMarkers() {
  try {
    let parsed = JSON.parse(await readFile8(markerFile(), "utf8"));
    return parsed && typeof parsed == "object" ? parsed : {};
  } catch {
    return {};
  }
}
async function setMarker(key, entry) {
  let all = await readMarkers();
  all[key] = entry;
  let p = markerFile();
  await mkdir8(path.dirname(p), { recursive: !0 }), await writeFile8(p, `${JSON.stringify(all, null, 2)}
`, "utf8");
}
async function collectHtml(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: !0 });
  } catch {
    return out;
  }
  for (let e of entries) {
    let abs = path.join(dir, e.name);
    e.isDirectory() ? await collectHtml(abs, out) : e.isFile() && e.name.toLowerCase().endsWith(".html") && out.push(abs);
  }
  return out;
}
async function detect(opts2) {
  log("\u2192 scanning for v3 projects (.brv/context-tree)\u2026");
  let projects = await scanV3Projects(opts2);
  return log(`  found ${projects.length} project(s)`), {
    ok: !0,
    command: "detect",
    projects: projects.map((p) => ({
      projectRoot: p.projectRoot,
      name: p.name,
      mdFiles: p.sources.length
    }))
  };
}
async function run(opts2) {
  let now = (/* @__PURE__ */ new Date()).toISOString(), runStartMs = Date.now(), projects = await scanV3Projects(opts2);
  if (log(`\u2192 ${projects.length} project(s) to migrate${opts2.dryRun ? " (dry-run)" : ""}`), opts2.dryRun) {
    let plan = [];
    for (let p of projects) {
      let warnings = 0;
      for (let s of p.sources)
        try {
          let md = await readFile8(s.absPath, "utf8");
          warnings += convertMarkdownTopicToHtml({ markdown: md, relPath: s.relPath, now }).warnings.length;
        } catch {
        }
      plan.push({ name: p.name, projectRoot: p.projectRoot, wouldConvert: p.sources.length, warnings });
    }
    return log("\u2192 dry-run: no spaces created, nothing written."), { ok: !0, command: "run", dryRun: !0, projects: plan };
  }
  let apiKey = await resolveBearer(opts2), teamId = await resolveTeamId(opts2, apiKey);
  log(`  target team: ${teamId} (space type: ${opts2.spaceType})`);
  let runTaskId = uuidv4(), agent = resolveAgent() || void 0;
  await appendAnalyticsRecord({
    name: AnalyticsEventNames.MIGRATION_STARTED,
    properties: {
      projects_total: projects.length,
      task_id: runTaskId,
      task_type: TASK_TYPE.MIGRATE,
      team_id: teamId,
      agent,
      agent_id: agent
    }
  });
  let markers = await readMarkers(), results = [];
  for (let p of projects) {
    log(`\u2192 ${p.name}: creating space + materializing ${p.sources.length} file(s)\u2026`);
    try {
      let key = localKey(teamId, p.projectRoot), id = markers[key]?.spaceId ?? uuidv4(), spaceId = await createSpace(opts2, apiKey, teamId, { id, name: p.name });
      await setMarker(key, {
        spaceId,
        spaceName: p.name,
        teamId,
        finalizedAt: now,
        projectRoot: p.projectRoot
      });
      let mat = await materializeMarkdownSpace({
        spaceId,
        spaceName: p.name,
        teamId,
        originalFolder: p.projectRoot,
        sources: p.sources,
        now
      });
      log(`  ${p.name} \u2192 space ${spaceId}: ${mat.converted}/${p.sources.length} converted`), results.push({
        name: p.name,
        projectRoot: p.projectRoot,
        spaceId,
        converted: mat.converted,
        failures: mat.failures
      });
    } catch (err) {
      let code = err instanceof MigrationError ? err.code : "project_failed";
      log(`  ! ${p.name} failed: ${err instanceof Error ? err.message : String(err)}`), results.push({
        name: p.name,
        projectRoot: p.projectRoot,
        error: { code, message: err instanceof Error ? err.message : String(err) }
      });
    }
  }
  let ok = results.every((r) => !("error" in r)), migratedOk = results.filter((r) => !("error" in r)), topicsConverted = migratedOk.reduce(
    (n, r) => n + (typeof r.converted == "number" ? r.converted : 0),
    0
  ), topicsFailed = migratedOk.reduce(
    (n, r) => n + (Array.isArray(r.failures) ? r.failures.length : 0),
    0
  );
  return await appendAnalyticsRecord({
    name: AnalyticsEventNames.MIGRATION_RUN_COMPLETED,
    properties: {
      duration_ms: Date.now() - runStartMs,
      outcome: results.length === migratedOk.length ? "completed" : migratedOk.length > 0 ? "partial" : "error",
      projects_total: projects.length,
      spaces_migrated: migratedOk.length,
      projects_failed: results.length - migratedOk.length,
      topics_converted: topicsConverted,
      topics_failed: topicsFailed,
      task_id: runTaskId,
      task_type: TASK_TYPE.MIGRATE,
      team_id: teamId,
      agent,
      agent_id: agent
    }
  }), { ok, command: "run", team: teamId, migrated: results };
}
async function verify(_opts) {
  let markers = await readMarkers(), spaces = [];
  for (let [, m] of Object.entries(markers)) {
    let tree = path.join(getGlobalDataDir(), "projects", m.spaceId, "context-tree");
    spaces.push({
      spaceId: m.spaceId,
      spaceName: m.spaceName,
      teamId: m.teamId,
      htmlTopics: (await collectHtml(tree)).length
    });
  }
  return { ok: !0, command: "verify", spaces };
}
var BACKUP_FOLDER_NAME = "ByteRover_Backups", BACKUP_MANIFEST_FILE = "manifest.json", BACKUP_VISIBLE_BRV_DIR = "brv", BACKUP_MANIFEST_VERSION = 1;
function uniqueFolderName(base, used) {
  let safe = base.replace(/[^a-zA-Z0-9._-]/g, "_") || "project", candidate = safe, n = 2;
  for (; used.has(candidate); )
    candidate = `${safe}-${n}`, n += 1;
  return used.add(candidate), candidate;
}
function resolveBackupParent(backupDir) {
  let target = backupDir ?? path.join(homedir2(), "Documents");
  return target.replace(/([/\\]ByteRover_Backups)+[/\\]?$/, "") || target;
}
async function readBackupManifest(backupPath) {
  try {
    let raw = await readFile8(path.join(backupPath, BACKUP_MANIFEST_FILE), "utf8"), m = JSON.parse(raw);
    if (m && Array.isArray(m.projects))
      return {
        version: m.version ?? BACKUP_MANIFEST_VERSION,
        createdAt: typeof m.createdAt == "string" ? m.createdAt : "",
        projects: m.projects
      };
  } catch {
  }
  return { version: BACKUP_MANIFEST_VERSION, createdAt: "", projects: [] };
}
async function cleanup(opts2) {
  let backupPath = path.join(resolveBackupParent(opts2.backupDir), BACKUP_FOLDER_NAME), markers = await readMarkers(), existing = await readBackupManifest(backupPath), usedFolders = new Set(existing.projects.map((p) => p.folder)), manifestProjects = [...existing.projects], removals = [], results = [];
  for (let [key, m] of Object.entries(markers)) {
    let projectRoot = m.projectRoot ?? key.replace(/^local:[^:]+:/, ""), brvDir = path.join(projectRoot, ".brv");
    if (!await isDir(brvDir)) {
      results.push({ projectRoot, status: "already-backed-up (no .brv)" });
      continue;
    }
    let v4tree = path.join(getGlobalDataDir(), "projects", m.spaceId, "context-tree");
    if (!await isDir(v4tree)) {
      results.push({ projectRoot, status: "skipped: v4 space not materialized \u2014 leaving .brv" });
      continue;
    }
    let folder = uniqueFolderName(
      path.basename(projectRoot) || m.spaceName || "project",
      usedFolders
    ), dest = path.join(backupPath, folder, BACKUP_VISIBLE_BRV_DIR);
    if (opts2.dryRun) {
      results.push({ projectRoot, wouldBackUpTo: dest, wouldRemove: brvDir });
      continue;
    }
    if (!opts2.yes) {
      results.push({ projectRoot, status: "needs --yes to back up + remove .brv" });
      continue;
    }
    log(`\u2192 ${projectRoot}: backing up .brv \u2192 ${dest}\u2026`), await mkdir8(path.dirname(dest), { recursive: !0 }), await cp(brvDir, dest, { recursive: !0, verbatimSymlinks: !0 }), manifestProjects.push({ folder, projectRoot, brvPath: brvDir }), removals.push(brvDir), results.push({ projectRoot, backedUpTo: dest, folder });
  }
  if (removals.length > 0) {
    await mkdir8(backupPath, { recursive: !0 });
    let manifest = {
      version: BACKUP_MANIFEST_VERSION,
      createdAt: existing.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
      projects: manifestProjects
    };
    await writeFile8(
      path.join(backupPath, BACKUP_MANIFEST_FILE),
      `${JSON.stringify(manifest, null, 2)}
`,
      "utf8"
    );
    for (let brvDir of removals) await rm9(brvDir, { recursive: !0, force: !0 });
  }
  return { ok: !0, command: "cleanup", backupPath, projects: results };
}

// src/entries/migrate-v3.ts
var HELP = "migrate-v3 <detect|run|verify|cleanup> [--dry-run] [--yes] [--scan-root <dir>] [--project <dir>]... [--team <id>] [--space-type team|personal] [--api-key-file <path>] [--auth-url <url>] [--backup-dir <dir>]", emit = (r) => void process.stdout.write(`${JSON.stringify(r)}
`), opts = parseFlags(process.argv.slice(2));
try {
  let result;
  opts.command === "detect" ? result = await detect(opts) : opts.command === "run" ? result = await run(opts) : opts.command === "verify" ? result = await verify(opts) : opts.command === "cleanup" ? result = await cleanup(opts) : result = { ok: !1, code: "usage", help: HELP }, emit(result), result.ok === !1 && process.exit(1);
} catch (err) {
  let code = err && typeof err == "object" && "code" in err ? String(err.code) : "unexpected_error";
  emit({ ok: !1, code, error: err instanceof Error ? err.message : String(err) }), process.exit(1);
}
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.1 https://github.com/nodeca/js-yaml @license MIT *)
*/
