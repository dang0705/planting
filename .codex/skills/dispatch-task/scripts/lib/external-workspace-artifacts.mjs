const normalize = value =>
  String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')

const uniqueSorted = values => [...new Set(values.map(normalize).filter(Boolean))].sort()

const globToRegExp = pattern => {
  let source = normalize(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&')
  source = source
    .replace(/\*\*/g, '§§DOUBLE§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§DOUBLE§§/g, '.*')
  return new RegExp(`^${source}$`)
}

const externalReasonixDirectory = /^\.reasonix(?:[A-Za-z0-9._-]*|\*)\/\*\*$/
const externalReasonixPluginBatch = /^reasonix-plugin-batch-[A-Za-z0-9][A-Za-z0-9._-]*\/\*\*$/

export const isApprovedExternalWorkspaceArtifactPattern = pattern => {
  const normalized = normalize(pattern)
  return externalReasonixDirectory.test(normalized) || externalReasonixPluginBatch.test(normalized)
}

export function validateExternalWorkspaceArtifactDeclarations(declarations) {
  if (declarations === undefined) {
    return { entries: [], errors: [] }
  }
  if (!Array.isArray(declarations)) {
    return {
      entries: [],
      errors: ['validation.external_workspace_artifacts must be an array when declared']
    }
  }

  const entries = []
  const errors = []
  for (const [index, declaration] of declarations.entries()) {
    const pathPattern = normalize(declaration?.path_pattern)
    const owner = String(declaration?.owner ?? '').trim()
    const evidence = String(declaration?.evidence ?? '').trim()
    if (!pathPattern) {
      errors.push(`external_workspace_artifacts[${index}].path_pattern is required`)
      continue
    }
    if (!isApprovedExternalWorkspaceArtifactPattern(pathPattern)) {
      errors.push(
        `external_workspace_artifacts[${index}] uses an unapproved path_pattern: ${pathPattern}`
      )
      continue
    }
    if (!owner) {
      errors.push(`external_workspace_artifacts[${index}].owner is required`)
      continue
    }
    if (!evidence) {
      errors.push(`external_workspace_artifacts[${index}].evidence is required`)
      continue
    }
    entries.push({ path_pattern: pathPattern, owner, evidence })
  }
  return { entries, errors }
}

export const matchesExternalWorkspaceArtifact = (file, declarations = []) =>
  declarations.some(declaration => globToRegExp(declaration.path_pattern).test(normalize(file)))

const matching = (files, declaration) =>
  uniqueSorted(files.filter(file => globToRegExp(declaration.path_pattern).test(normalize(file))))

export function auditExternalWorkspaceArtifacts({
  declarations,
  baselineFiles,
  currentFiles,
  changedSinceBaseline,
  preexistingDirtyModified,
  missingBaselineFingerprints,
  disappearedSinceBaseline
}) {
  const validation = validateExternalWorkspaceArtifactDeclarations(declarations)
  const auditedEntries = validation.entries.map(declaration => {
    const addedSinceBaseline = matching(changedSinceBaseline, declaration)
    const modifiedSinceBaseline = matching(preexistingDirtyModified, declaration)
    const missingFingerprints = matching(missingBaselineFingerprints, declaration)
    const disappeared = matching(disappearedSinceBaseline, declaration)
    return {
      ...declaration,
      baseline_paths: matching(baselineFiles, declaration),
      current_paths: matching(currentFiles, declaration),
      added_since_baseline: addedSinceBaseline,
      modified_since_baseline: modifiedSinceBaseline,
      missing_baseline_fingerprints: missingFingerprints,
      disappeared_since_baseline: disappeared,
      excluded_from_implementer_ownership_checks: uniqueSorted([
        ...addedSinceBaseline,
        ...modifiedSinceBaseline,
        ...missingFingerprints,
        ...disappeared
      ])
    }
  })
  return {
    valid_declarations: validation.entries,
    declarations: auditedEntries,
    excluded_paths: uniqueSorted(
      auditedEntries.flatMap(entry => entry.excluded_from_implementer_ownership_checks)
    ),
    errors: validation.errors
  }
}
