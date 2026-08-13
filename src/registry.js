import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Extractor registry (L12): loads extractors/*.json, validates + freezes them at
// startup, before any spend. Hand-written validator, zero deps — no JSON-Schema
// library is pulled in; META (schemas/extractor.schema.json) is read once as the
// single source of truth for which top-level keys exist, so the validator and the
// meta-schema file can never drift apart.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SCHEMAS_DIR = path.join(__dirname, '..', 'schemas');

export class RegistryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CONFIG_INVALID';
  }
}

const META = JSON.parse(readFileSync(path.join(DEFAULT_SCHEMAS_DIR, 'extractor.schema.json'), 'utf8'));
const REQUIRED_KEYS = META.required;
const ALLOWED_KEYS = Object.keys(META.properties);

// Portability lint keyword blocklist (Anthropic ∩ OpenAI structured-output subset).
const FORBIDDEN_KEYWORDS = ['allOf', 'not', 'if', 'then', 'else', 'minLength', 'maxLength', 'minimum', 'maximum', 'multipleOf'];

// ---- opengong:// $ref resolver — reads schemas/<name>.json lazily, on first use ----
function makeResolver(schemasDir) {
  const cache = new Map();
  return function resolve(ref, atPath) {
    if (cache.has(ref)) return cache.get(ref);
    const name = ref.slice('opengong://'.length);
    const file = path.join(schemasDir, `${name}.json`);
    let schema;
    try {
      schema = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      throw new RegistryError(`CONFIG_INVALID: ${atPath} cannot resolve "${ref}" -> ${file}: ${err.message}`);
    }
    if (schema.$id !== ref) {
      throw new RegistryError(`CONFIG_INVALID: ${file} has $id "${schema.$id}", expected "${ref}"`);
    }
    cache.set(ref, schema);
    return schema;
  };
}

// ---- portability lint: object schemas closed+fully-required, no forbidden
// keywords, minItems in {0,1} only, no self-referential $ref cycles ----
function lintPortability(schema, resolve, seenRefs, atPath) {
  if (schema == null || typeof schema !== 'object') return;

  if (schema.$ref) {
    if (seenRefs.has(schema.$ref)) {
      throw new RegistryError(`CONFIG_INVALID: recursive schema $ref at ${atPath} ("${schema.$ref}")`);
    }
    lintPortability(resolve(schema.$ref, atPath), resolve, new Set(seenRefs).add(schema.$ref), `${atPath}->${schema.$ref}`);
    return;
  }

  for (const kw of FORBIDDEN_KEYWORDS) {
    if (kw in schema) {
      throw new RegistryError(`CONFIG_INVALID: forbidden schema keyword "${kw}" at ${atPath} (portability lint)`);
    }
  }
  if ('minItems' in schema && schema.minItems !== 0 && schema.minItems !== 1) {
    throw new RegistryError(`CONFIG_INVALID: minItems must be 0 or 1 at ${atPath}, got ${schema.minItems}`);
  }

  if (schema.type === 'object' && schema.properties) {
    const keys = Object.keys(schema.properties);
    if (schema.additionalProperties !== false) {
      throw new RegistryError(`CONFIG_INVALID: object at ${atPath} must set additionalProperties:false`);
    }
    const required = schema.required ?? [];
    if (keys.length !== required.length || !keys.every((k) => required.includes(k))) {
      throw new RegistryError(`CONFIG_INVALID: object at ${atPath} must require every declared property`);
    }
    for (const key of keys) lintPortability(schema.properties[key], resolve, seenRefs, `${atPath}.${key}`);
  }
  if (schema.type === 'array' && schema.items) {
    lintPortability(schema.items, resolve, seenRefs, `${atPath}[]`);
  }
}

// ---- evidence-reachability lint: evidence_required:true -> every claim-bearing
// object (one with a "text" property) must also carry "evidence" (directly or via
// an array) $ref'd to opengong://evidence, and "evidence" must key-order before
// "text" (evidence-before-claim, technical-spec-core.md) ----
function lintEvidenceReachability(schema, resolve, atPath) {
  if (schema == null || typeof schema !== 'object') return;
  if (schema.$ref) {
    lintEvidenceReachability(resolve(schema.$ref, atPath), resolve, `${atPath}->${schema.$ref}`);
    return;
  }
  if (schema.type === 'object' && schema.properties) {
    const keys = Object.keys(schema.properties);
    if (keys.includes('text')) {
      const evIdx = keys.indexOf('evidence');
      if (evIdx === -1) {
        throw new RegistryError(`CONFIG_INVALID: claim-bearing object at ${atPath} (has "text") has no "evidence" property`);
      }
      if (evIdx > keys.indexOf('text')) {
        throw new RegistryError(`CONFIG_INVALID: "evidence" must precede "text" (evidence-before-claim key order) at ${atPath}`);
      }
      const evSchema = schema.properties.evidence;
      const evRef = evSchema.$ref ?? evSchema.items?.$ref;
      if (evRef !== 'opengong://evidence') {
        throw new RegistryError(`CONFIG_INVALID: "evidence" at ${atPath} must $ref "opengong://evidence" (directly or via array items)`);
      }
    }
    for (const key of keys) lintEvidenceReachability(schema.properties[key], resolve, `${atPath}.${key}`);
  }
  if (schema.type === 'array' && schema.items) {
    lintEvidenceReachability(schema.items, resolve, `${atPath}[]`);
  }
}

function validateShape(def, filePath) {
  if ('model' in def) {
    throw new RegistryError(
      `CONFIG_INVALID: ${filePath} declares a "model" key — extractors declare a role, never a model ` +
      `(L12); capabilities.json maps role -> model with typed fallbacks`,
    );
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in def)) throw new RegistryError(`CONFIG_INVALID: ${filePath} missing required key "${key}"`);
  }
  for (const key of Object.keys(def)) {
    if (!ALLOWED_KEYS.includes(key)) {
      throw new RegistryError(`CONFIG_INVALID: ${filePath} has unknown key "${key}"`);
    }
  }
}

function deepFreeze(obj) {
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
  }
  return obj;
}

// loadExtractors(dirs, opts?) — dirs is a directory path or an array of directory
// paths (merged; lets tests construct a cross-directory duplicate-name case without
// needing two files of the same name in one directory, which the filesystem itself
// forbids). opts.schemasDir overrides where opengong:// refs resolve from (defaults
// to the real project schemas/ dir) — tests use this to stay independent of
// schemas/evidence.json, which is built by a parallel slice.
export function loadExtractors(dirs, { schemasDir = DEFAULT_SCHEMAS_DIR } = {}) {
  const dirList = Array.isArray(dirs) ? dirs : [dirs];
  const resolve = makeResolver(schemasDir);
  const registry = {};

  for (const dir of dirList) {
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const filePath = path.join(dir, file);
      const basename = file.slice(0, -'.json'.length);
      const def = JSON.parse(readFileSync(filePath, 'utf8'));

      validateShape(def, filePath);
      if (def.name !== basename) {
        throw new RegistryError(`CONFIG_INVALID: ${filePath} name "${def.name}" does not match filename "${basename}"`);
      }
      if (registry[def.name]) {
        throw new RegistryError(`CONFIG_INVALID: duplicate extractor name "${def.name}" (${filePath} collides with an already-loaded extractor)`);
      }

      lintPortability(def.output_schema, resolve, new Set(), `${def.name}.output_schema`);
      if (def.evidence_required) {
        lintEvidenceReachability(def.output_schema, resolve, `${def.name}.output_schema`);
      }

      const sha256 = createHash('sha256').update(JSON.stringify(def)).digest('hex');
      registry[def.name] = deepFreeze({ ...def, sha256 });
    }
  }

  return Object.freeze(registry);
}
