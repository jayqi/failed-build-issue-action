const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

// Single source of truth for the action's declared metadata, parsed straight
// from action.yml so tests can assert against it instead of hand-copied values.
const actionYml = YAML.parse(
  fs.readFileSync(path.join(__dirname, '..', 'action.yml'), 'utf8'),
);

const declaredInputs = Object.keys(actionYml.inputs).sort();

module.exports = { actionYml, declaredInputs };
