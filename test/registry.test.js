import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadExtractors, RegistryError, DEFAULT_SCHEMAS_DIR } from '../src/registry.js';

// Registry tests run against a throwaway schemas dir carrying a local stub of
// opengong://evidence — this keeps the suite independent of schemas/evidence.json,
// which is being built by a parallel slice and may not exist yet. The stub is the
// exact shape handed down for that file, so lint behavior matches the real thing.
const EVIDENCE_STUB = {
  $id: 'opengong://evidence',
  type: 'object',
  additionalProperties: false,
  required: ['utterance_id', 'quote'],
  properties: {
    utterance_id: { type: 'integer' },
    quote: { type: 'string' },
  },
};

function tmpDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function makeSchemasDir() {
  const dir = tmpDir('opengong-schemas-');
  writeFileSync(path.join(dir, 'evidence.json'), JSON.stringify(EVIDENCE_STUB));
  return dir;
}

function writeExtractor(dir, filename, def) {
  writeFileSync(path.join(dir, filename), JSON.stringify(def));
}

const VALID_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['claims'],
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['evidence', 'text'],
        properties: {
          evidence: { type: 'array', items: { $ref: 'opengong://evidence' } },
          text: { type: 'string' },
        },
      },
    },
  },
};

function validDef(overrides = {}) {
  return {
    name: 'sample',
    version: '1.0.0',
    title: 'Sample',
    description: 'A sample extractor for registry tests.',
    enabled: true,
    role: 'extraction',
    scope: 'call',
    prompt: 'Extract sample claims.',
    evidence_required: true,
    // deep clone: each test mutates its own output_schema to provoke a specific
    // lint failure, and must never leak that mutation into other tests.
    output_schema: JSON.parse(JSON.stringify(VALID_OUTPUT_SCHEMA)),
    ...overrides,
  };
}

test('loads a valid extractor, freezes it, and stamps a sha256', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  writeExtractor(extractorsDir, 'sample.json', validDef());

  const registry = loadExtractors(extractorsDir, { schemasDir });

  assert.ok(registry.sample);
  assert.equal(registry.sample.name, 'sample');
  assert.match(registry.sample.sha256, /^[0-9a-f]{64}$/);
  assert.ok(Object.isFrozen(registry));
  assert.ok(Object.isFrozen(registry.sample));
  assert.ok(Object.isFrozen(registry.sample.output_schema));
});

test('name !== basename throws CONFIG_INVALID', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  writeExtractor(extractorsDir, 'sample.json', validDef({ name: 'not-sample' }));

  assert.throws(
    () => loadExtractors(extractorsDir, { schemasDir }),
    (err) => err instanceof RegistryError && err.name === 'CONFIG_INVALID' && /name .* does not match filename/.test(err.message),
  );
});

test('duplicate extractor name across merged directories throws', () => {
  const dirA = tmpDir('opengong-extractors-a-');
  const dirB = tmpDir('opengong-extractors-b-');
  const schemasDir = makeSchemasDir();
  writeExtractor(dirA, 'sample.json', validDef());
  writeExtractor(dirB, 'sample.json', validDef());

  assert.throws(
    () => loadExtractors([dirA, dirB], { schemasDir }),
    (err) => err instanceof RegistryError && /duplicate extractor name "sample"/.test(err.message),
  );
});

test('a "model" key is forbidden and the error cites L12', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  writeExtractor(extractorsDir, 'sample.json', validDef({ model: 'claude-sonnet-5' }));

  assert.throws(
    () => loadExtractors(extractorsDir, { schemasDir }),
    (err) => err instanceof RegistryError && /L12/.test(err.message) && /never a model/.test(err.message),
  );
});

test('missing a required top-level key throws CONFIG_INVALID', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  const def = validDef();
  delete def.description;
  writeExtractor(extractorsDir, 'sample.json', def);

  assert.throws(
    () => loadExtractors(extractorsDir, { schemasDir }),
    (err) => err instanceof RegistryError && /missing required key "description"/.test(err.message),
  );
});

test('an unknown top-level key throws CONFIG_INVALID', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  writeExtractor(extractorsDir, 'sample.json', validDef({ temperature: 0.2 }));

  assert.throws(
    () => loadExtractors(extractorsDir, { schemasDir }),
    (err) => err instanceof RegistryError && /unknown key "temperature"/.test(err.message),
  );
});

test('portability lint rejects minLength anywhere in output_schema', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  const def = validDef();
  def.output_schema.properties.claims.items.properties.text.minLength = 5;
  writeExtractor(extractorsDir, 'sample.json', def);

  assert.throws(
    () => loadExtractors(extractorsDir, { schemasDir }),
    (err) => err instanceof RegistryError && /forbidden schema keyword "minLength"/.test(err.message),
  );
});

for (const kw of ['allOf', 'not', 'if', 'maxLength', 'minimum', 'maximum', 'multipleOf']) {
  test(`portability lint rejects "${kw}" anywhere in output_schema`, () => {
    const extractorsDir = tmpDir('opengong-extractors-');
    const schemasDir = makeSchemasDir();
    const def = validDef();
    def.output_schema.properties.claims.items.properties.text[kw] = kw === 'if' ? {} : 1;
    writeExtractor(extractorsDir, 'sample.json', def);

    assert.throws(
      () => loadExtractors(extractorsDir, { schemasDir }),
      (err) => err instanceof RegistryError && new RegExp(`forbidden schema keyword "${kw}"`).test(err.message),
    );
  });
}

test('portability lint rejects an object missing additionalProperties:false', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  const def = validDef();
  delete def.output_schema.properties.claims.items.additionalProperties;
  writeExtractor(extractorsDir, 'sample.json', def);

  assert.throws(
    () => loadExtractors(extractorsDir, { schemasDir }),
    (err) => err instanceof RegistryError && /additionalProperties:false/.test(err.message),
  );
});

test('portability lint rejects an object with an optional (non-required) property', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  const def = validDef();
  def.output_schema.properties.claims.items.properties.note = { type: 'string' };
  // "note" is not added to required[] -> must be rejected
  writeExtractor(extractorsDir, 'sample.json', def);

  assert.throws(
    () => loadExtractors(extractorsDir, { schemasDir }),
    (err) => err instanceof RegistryError && /must require every declared property/.test(err.message),
  );
});

test('portability lint rejects minItems values other than 0 or 1', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  const def = validDef();
  def.output_schema.properties.claims.minItems = 2;
  writeExtractor(extractorsDir, 'sample.json', def);

  assert.throws(
    () => loadExtractors(extractorsDir, { schemasDir }),
    (err) => err instanceof RegistryError && /minItems must be 0 or 1/.test(err.message),
  );
});

test('evidence-reachability: a claim-bearing object without "evidence" throws', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  const def = validDef();
  def.output_schema.properties.claims.items.required = ['text'];
  delete def.output_schema.properties.claims.items.properties.evidence;
  writeExtractor(extractorsDir, 'sample.json', def);

  assert.throws(
    () => loadExtractors(extractorsDir, { schemasDir }),
    (err) => err instanceof RegistryError && /has no "evidence" property/.test(err.message),
  );
});

test('evidence-reachability: "evidence" key must precede "text" (evidence-before-claim order)', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  const def = validDef();
  const claimItem = def.output_schema.properties.claims.items;
  // rebuild properties with text before evidence
  claimItem.properties = { text: claimItem.properties.text, evidence: claimItem.properties.evidence };
  claimItem.required = ['text', 'evidence'];
  writeExtractor(extractorsDir, 'sample.json', def);

  assert.throws(
    () => loadExtractors(extractorsDir, { schemasDir }),
    (err) => err instanceof RegistryError && /must precede "text"/.test(err.message),
  );
});

test('evidence-reachability: evidence_required:false skips the lint entirely', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  const def = validDef({ evidence_required: false });
  delete def.output_schema.properties.claims.items.properties.evidence;
  def.output_schema.properties.claims.items.required = ['text'];
  writeExtractor(extractorsDir, 'sample.json', def);

  assert.doesNotThrow(() => loadExtractors(extractorsDir, { schemasDir }));
});

test('portability lint rejects a cyclic $ref chain across schema files', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  writeFileSync(path.join(schemasDir, 'cycle-a.json'), JSON.stringify({
    $id: 'opengong://cycle-a',
    type: 'object',
    additionalProperties: false,
    required: ['b'],
    properties: { b: { $ref: 'opengong://cycle-b' } },
  }));
  writeFileSync(path.join(schemasDir, 'cycle-b.json'), JSON.stringify({
    $id: 'opengong://cycle-b',
    type: 'object',
    additionalProperties: false,
    required: ['a'],
    properties: { a: { $ref: 'opengong://cycle-a' } },
  }));
  const def = validDef();
  def.output_schema = {
    type: 'object',
    additionalProperties: false,
    required: ['a'],
    properties: { a: { $ref: 'opengong://cycle-a' } },
  };
  writeExtractor(extractorsDir, 'sample.json', def);

  assert.throws(
    () => loadExtractors(extractorsDir, { schemasDir }),
    (err) => err instanceof RegistryError && /recursive schema \$ref/.test(err.message),
  );
});

test('F5 evidence-reachability recurses through a UNION-type parent (type:["object","null"])', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  const def = validDef();
  def.output_schema = {
    type: 'object',
    additionalProperties: false,
    required: ['wrap'],
    properties: {
      wrap: {
        type: ['object', 'null'], // union parent — must still be entered
        additionalProperties: false,
        required: ['text'],
        properties: { text: { type: 'string' } }, // claim-bearing, but no "evidence"
      },
    },
  };
  writeExtractor(extractorsDir, 'sample.json', def);

  assert.throws(
    () => loadExtractors(extractorsDir, { schemasDir }),
    (err) => err instanceof RegistryError && /has no "evidence" property/.test(err.message),
  );
});

test('F5 portability lint recurses through a TYPELESS parent to catch a forbidden keyword', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  const def = validDef();
  def.output_schema = {
    type: 'object',
    additionalProperties: false,
    required: ['wrap'],
    properties: {
      wrap: {
        // no "type" at all — a typeless object node
        additionalProperties: false,
        required: ['evidence', 'text'],
        properties: {
          evidence: { type: 'array', items: { $ref: 'opengong://evidence' } },
          text: { type: 'string', minLength: 5 }, // forbidden keyword hidden here
        },
      },
    },
  };
  writeExtractor(extractorsDir, 'sample.json', def);

  assert.throws(
    () => loadExtractors(extractorsDir, { schemasDir }),
    (err) => err instanceof RegistryError && /forbidden schema keyword "minLength"/.test(err.message),
  );
});

test('F5 evidence-reachability recurses through array prefixItems (tuple schemas)', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  const def = validDef();
  def.output_schema = {
    type: 'object',
    additionalProperties: false,
    required: ['rows'],
    properties: {
      rows: {
        type: 'array',
        prefixItems: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['text', 'evidence'], // text BEFORE evidence -> order violation
            properties: {
              text: { type: 'string' },
              evidence: { type: 'array', items: { $ref: 'opengong://evidence' } },
            },
          },
        ],
      },
    },
  };
  writeExtractor(extractorsDir, 'sample.json', def);

  assert.throws(
    () => loadExtractors(extractorsDir, { schemasDir }),
    (err) => err instanceof RegistryError && /must precede "text"/.test(err.message),
  );
});

test('a frozen registry cannot be mutated', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  writeExtractor(extractorsDir, 'sample.json', validDef());
  const registry = loadExtractors(extractorsDir, { schemasDir });

  assert.throws(() => { registry.sample.enabled = false; }, TypeError);
  assert.throws(() => { registry.other = {}; }, TypeError);
  assert.equal(registry.sample.enabled, true);
});

test('optional fields (applies_to, required_section, crm_map) are accepted', () => {
  const extractorsDir = tmpDir('opengong-extractors-');
  const schemasDir = makeSchemasDir();
  writeExtractor(extractorsDir, 'sample.json', validDef({
    applies_to: ['discovery', 'demo'],
    required_section: true,
    crm_map: { field: 'Sample_Field__c' },
  }));

  assert.doesNotThrow(() => loadExtractors(extractorsDir, { schemasDir }));
});

test('claim-context.json is a self-consistent, portable schema fragment', () => {
  const claimContext = JSON.parse(readFileSync(path.join(DEFAULT_SCHEMAS_DIR, 'claim-context.json'), 'utf8'));
  assert.equal(claimContext.$id, 'opengong://claim-context');
  assert.equal(claimContext.additionalProperties, false);
  assert.deepEqual(Object.keys(claimContext.properties).sort(), [...claimContext.required].sort());
  assert.deepEqual(
    Object.keys(claimContext.properties.stance.properties).sort(),
    [...claimContext.properties.stance.required].sort(),
  );
});

test('extractors/summary.json and extractors/objections.json are self-consistent (name matches, no model key)', () => {
  const extractorsDir = path.join(DEFAULT_SCHEMAS_DIR, '..', 'extractors');
  for (const filename of ['summary.json', 'objections.json']) {
    const def = JSON.parse(readFileSync(path.join(extractorsDir, filename), 'utf8'));
    assert.equal(`${def.name}.json`, filename);
    assert.equal('model' in def, false);
    assert.equal(def.evidence_required, true);
  }
});

test('extractors/summary.json and extractors/objections.json load once schemas/evidence.json exists', (t) => {
  const evidenceFile = path.join(DEFAULT_SCHEMAS_DIR, 'evidence.json');
  if (!existsSync(evidenceFile)) {
    t.skip('schemas/evidence.json not yet present (built by a parallel slice) — resolver logic is covered by the stub-based tests above');
    return;
  }
  const extractorsDir = path.join(DEFAULT_SCHEMAS_DIR, '..', 'extractors');
  const registry = loadExtractors(extractorsDir);
  assert.ok(registry.summary);
  assert.ok(registry.objections);
  assert.ok(Object.isFrozen(registry.summary));
  assert.equal(registry.summary.applies_to.includes('all'), true);
  assert.equal(registry.summary.required_section, true);
  assert.deepEqual(registry.objections.output_schema.properties.objections.items.properties.category.enum, [
    'price', 'timing', 'authority', 'competitor', 'fit', 'trust',
  ]);
});
