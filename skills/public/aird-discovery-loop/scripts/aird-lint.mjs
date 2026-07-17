#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
const strict = args.includes("--strict-schema")
const packageArg = args.find((arg) => !arg.startsWith("--"))

if (!packageArg) {
  console.error("Usage: node aird-lint.mjs <aird-package> [--strict-schema]")
  process.exit(2)
}

const packageDir = path.resolve(packageArg)
const errors = []
const warnings = []

function read(relativePath, required = true) {
  const absolutePath = path.join(packageDir, relativePath)
  if (!fs.existsSync(absolutePath)) {
    if (required) errors.push(`missing required file: ${relativePath}`)
    return ""
  }
  return fs.readFileSync(absolutePath, "utf8")
}

function scalar(value) {
  const trimmed = value.trim()
  if (trimmed === "[]") return []
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const body = trimmed.slice(1, -1).trim()
    if (!body) return []
    return body.split(",").map((item) => scalar(item))
  }
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("`") && trimmed.endsWith("`"))) {
    return trimmed.slice(1, -1)
  }
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed)
  return trimmed
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) return { data: null, body: markdown }
  const end = markdown.indexOf("\n---\n", 4)
  if (end < 0) return { data: null, body: markdown }
  const lines = markdown.slice(4, end).split(/\r?\n/)
  const data = {}
  let activeList = null
  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue
    const list = rawLine.match(/^\s+-\s+(.+)$/)
    if (list && activeList) {
      data[activeList].push(scalar(list[1]))
      continue
    }
    const pair = rawLine.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!pair) continue
    const [, key, rawValue] = pair
    if (!rawValue.trim()) {
      data[key] = []
      activeList = key
    } else {
      data[key] = scalar(rawValue)
      activeList = null
    }
  }
  return { data, body: markdown.slice(end + 5) }
}

function ids(text, expression) {
  return [...new Set(text.match(expression) || [])].sort()
}

function asArray(value) {
  if (Array.isArray(value)) return value.map(String)
  if (value === undefined || value === null || value === "") return []
  return [String(value)]
}

function sameMembers(left, right) {
  return [...left].sort().join("|") === [...right].sort().join("|")
}

function markdownSection(markdown, headingPattern) {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((line) => /^##\s+/.test(line) && headingPattern.test(line))
  if (start < 0) return ""
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index
      break
    }
  }
  return lines.slice(start, end).join("\n")
}

function mapping(markdown, sourceExpression, targetExpression, headingPattern) {
  const section = markdownSection(markdown, headingPattern)
  const result = new Map()
  if (!section) return result
  for (const line of section.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue
    const columns = line.split("|").map((item) => item.trim()).filter(Boolean)
    const source = columns.flatMap((column) => column.match(sourceExpression) || [])[0]
    if (!source) continue
    const targets = [...new Set(columns.flatMap((column) => column.match(targetExpression) || []))].sort()
    if (targets.length) result.set(source, targets)
  }
  return result
}

const requiredArtifacts = [
  "STATE.md",
  "00-intake.md",
  "00-discussion-log.md",
  "01-prd.md",
  "03-risk-register.md",
  "04-trd.md",
  "07-implementation-plan.md",
  "08-quality-gates.md",
  "09-dod.md",
]

for (const artifact of requiredArtifacts) read(artifact)

const state = read("STATE.md")
const riskRegister = read("03-risk-register.md")
const plan = read("07-implementation-plan.md")
const gates = read("08-quality-gates.md")
const dod = read("09-dod.md")
const workorderDir = path.join(packageDir, "workorders")
const workorderFiles = fs.existsSync(workorderDir)
  ? fs.readdirSync(workorderDir).filter((file) => file.endsWith(".md")).sort()
  : []

if (!workorderFiles.length) errors.push("no workorders found")

const requiredHeadings = [
  "## Identity",
  "## Context",
  "## Task Breakdown",
  "## Scope",
  "## Contracts",
  "## Must Haves",
  "## Acceptance Criteria",
  "## Verification",
  "## Reporting",
]

const workorders = new Map()
const reviewPackets = new Map()

for (const file of workorderFiles) {
  const markdown = fs.readFileSync(path.join(workorderDir, file), "utf8")
  const { data, body } = parseFrontmatter(markdown)
  const legacyId = body.match(/^- ID:\s*`?(WO-\d+)`?\s*$/m)?.[1]
  const filenameId = file.match(/^(WO-\d+)/)?.[1]
  const id = data?.id ? String(data.id) : legacyId || filenameId

  if (!id) {
    errors.push(`${file}: missing workorder ID`)
    continue
  }
  if (workorders.has(id)) errors.push(`${file}: duplicate ID ${id}`)
  if (filenameId && filenameId !== id) errors.push(`${file}: filename ID ${filenameId} != ${id}`)

  for (const heading of requiredHeadings) {
    if (!body.includes(heading)) errors.push(`${id}: missing ${heading}`)
  }

  const taskBlock = body.match(/## Task Breakdown\s*\n([\s\S]*?)\n## Scope/)?.[1] || ""
  const taskCount = (taskBlock.match(/^\d+\.\s+/gm) || []).length
  if (taskCount < 1 || taskCount > 3) errors.push(`${id}: task count ${taskCount}; expected 1-3`)

  const acceptanceBlock = body.match(/## Acceptance Criteria\s*\n([\s\S]*?)\n## Verification/)?.[1] || ""
  const acceptanceScenarioCount = (acceptanceBlock.match(/^\d+\.\s+/gm) || []).length

  let dependsOn = []
  let riskIds = []
  let gateIds = []
  let dodIds = []
  let reviewPacket = "legacy"
  let workClass = "legacy"
  let status = "legacy"
  let verticalSliceId = "none"
  let runtimeBoundaries = []
  let lifecycleOperations = []

  if (data) {
    const v3Contract = strict || String(data.aird_workorder_schema_version) === '3.0'
    const requiredKeys = [
      "aird_workorder_schema_version",
      "id",
      "kind",
      "status",
      "priority",
      "depends_on",
      "risk_ids",
      "gate_ids",
      "dod_ids",
      "review_packet",
      "allowed_write_paths",
      "docs_to_read",
    ]
    if (v3Contract) {
      requiredKeys.push(
        "work_class",
        "vertical_slice_id",
        "runtime_boundaries",
        "acceptance_scenario_count",
        "lifecycle_operations",
      )
    }
    for (const key of requiredKeys) {
      if (!(key in data)) errors.push(`${id}: missing frontmatter key ${key}`)
    }

    if (strict && String(data.aird_workorder_schema_version) !== '3.0') {
      errors.push(`${id}: strict schema requires aird_workorder_schema_version 3.0`)
    }

    if (!['implementation', 'spike', 'evidence', 'review'].includes(String(data.kind))) {
      errors.push(`${id}: invalid kind ${data.kind}`)
    }
    workClass = String(data.work_class || 'legacy')
    if (v3Contract && !['product', 'supporting', 'verification'].includes(workClass)) {
      errors.push(`${id}: invalid work_class ${data.work_class}`)
    }
    status = String(data.status)
    if (!['draft', 'ready', 'in_progress', 'done', 'blocked', 'deferred'].includes(status)) {
      errors.push(`${id}: invalid status ${data.status}`)
    }

    dependsOn = asArray(data.depends_on)
    riskIds = asArray(data.risk_ids)
    gateIds = asArray(data.gate_ids)
    dodIds = asArray(data.dod_ids)
    reviewPacket = String(data.review_packet || "")
    verticalSliceId = String(data.vertical_slice_id || "")
    runtimeBoundaries = asArray(data.runtime_boundaries).map((item) => item.toLowerCase())
    lifecycleOperations = asArray(data.lifecycle_operations).map((item) => item.toLowerCase())
    const writes = asArray(data.allowed_write_paths)
    const docs = asArray(data.docs_to_read)
    const declaredAcceptanceCount = Number(data.acceptance_scenario_count)

    if (!writes.length) errors.push(`${id}: allowed_write_paths is empty`)
    if (writes.some((item) => [".", "**", "*"].includes(item))) {
      errors.push(`${id}: allowed_write_paths contains an unbounded root pattern`)
    }
    if (!docs.length) errors.push(`${id}: docs_to_read is empty`)
    if (docs.some((item) => !item.includes("#"))) {
      const message = `${id}: docs_to_read must name exact sections with #`
      if (strict) errors.push(message)
      else warnings.push(message)
    }
    if (!reviewPacket) errors.push(`${id}: review_packet is empty`)

    if (v3Contract) {
      if (!verticalSliceId) errors.push(`${id}: vertical_slice_id is empty`)
      if (workClass === 'product' && data.kind === 'implementation' && verticalSliceId === 'none') {
        errors.push(`${id}: product implementation requires a vertical_slice_id`)
      }

      if (!Number.isInteger(declaredAcceptanceCount) || declaredAcceptanceCount < 0) {
        errors.push(`${id}: acceptance_scenario_count must be a non-negative integer`)
      } else {
        if (declaredAcceptanceCount !== acceptanceScenarioCount) {
          errors.push(`${id}: acceptance_scenario_count=${declaredAcceptanceCount}, numbered scenarios=${acceptanceScenarioCount}`)
        }
        if (data.kind === 'implementation' && declaredAcceptanceCount > 8) {
          errors.push(`${id}: oversized implementation has ${declaredAcceptanceCount} acceptance scenarios; max 8`)
        }
        if (data.kind === 'implementation' && ['ready', 'in_progress', 'done'].includes(status) && declaredAcceptanceCount < 1) {
          errors.push(`${id}: executable implementation requires at least one acceptance scenario`)
        }
      }

      if (runtimeBoundaries.length > 1) {
        errors.push(`${id}: oversized workorder crosses ${runtimeBoundaries.length} runtime boundaries; max 1`)
      }
      const boundaryCategories = new Set(runtimeBoundaries.map((boundary) => {
        if (/^(k8s|kubernetes)$/.test(boundary)) return 'kubernetes'
        if (/^(db|database|postgres|postgresql|mysql|sqlite)$/.test(boundary)) return 'database'
        if (/^(scm|git|github|gitlab|bitbucket)$/.test(boundary)) return 'scm'
        if (/^(registry|container-registry|ecr|gcr|ghcr)$/.test(boundary)) return 'registry'
        return boundary
      }))
      if (['kubernetes', 'database', 'scm', 'registry'].every((item) => boundaryCategories.has(item))) {
        errors.push(`${id}: oversized workorder combines Kubernetes, database, SCM, and registry`)
      }

      const lifecycleSet = new Set(lifecycleOperations)
      const fullLifecycle = ['build', 'start', 'health', 'live', 'rollback', 'cleanup']
      if (fullLifecycle.every((item) => lifecycleSet.has(item))) {
        errors.push(`${id}: oversized workorder owns build/start/health/live/rollback/cleanup`)
      }
    }

    if (data.kind === "spike") {
      for (const key of ["spike_question", "on_pass", "on_fail", "must_not_decide"]) {
        if (!(key in data) || asArray(data[key]).length === 0) errors.push(`${id}: spike missing ${key}`)
      }
      if (data.on_fail && !/(return_to_discovery|blocked|stop|pivot)/i.test(String(data.on_fail))) {
        errors.push(`${id}: spike on_fail must fail closed or return to discovery`)
      }
    }
  } else {
    const dependsLine = body.match(/^- Depends on:\s*(.*)$/m)?.[1] || ""
    dependsOn = ids(dependsLine, /WO-\d+/g)
    riskIds = ids(body, /R-\d+/g)
    gateIds = ids(body, /G-\d+/g)
    dodIds = ids(body, /DOD-\d+/g)
    const message = `${id}: missing Workorder Frontmatter V3`
    if (strict) errors.push(message)
    else warnings.push(message)
  }

  for (const dependency of dependsOn) {
    if (!/^WO-\d+$/.test(dependency)) errors.push(`${id}: invalid dependency ${dependency}`)
  }
  for (const riskId of riskIds) if (!/^R-\d+$/.test(riskId)) errors.push(`${id}: invalid risk ID ${riskId}`)
  for (const gateId of gateIds) if (!/^G-\d+$/.test(gateId)) errors.push(`${id}: invalid gate ID ${gateId}`)
  for (const dodId of dodIds) if (!/^DOD-\d+$/.test(dodId)) errors.push(`${id}: invalid DoD ID ${dodId}`)

  workorders.set(id, {
    file,
    dependsOn,
    riskIds,
    gateIds,
    dodIds,
    reviewPacket,
    data,
    workClass,
    status,
    verticalSliceId,
    runtimeBoundaries,
    lifecycleOperations,
  })
  if (!reviewPackets.has(reviewPacket)) reviewPackets.set(reviewPacket, [])
  reviewPackets.get(reviewPacket).push(id)
}

for (const [id, workorder] of workorders) {
  for (const dependency of workorder.dependsOn) {
    if (!workorders.has(dependency)) errors.push(`${id}: dependency does not exist: ${dependency}`)
  }
}

const visiting = new Set()
const visited = new Set()
const cycles = new Set()
function walk(id, stack) {
  if (visiting.has(id)) {
    cycles.add([...stack, id].join(" -> "))
    return
  }
  if (visited.has(id)) return
  visiting.add(id)
  for (const dependency of workorders.get(id)?.dependsOn || []) walk(dependency, [...stack, id])
  visiting.delete(id)
  visited.add(id)
}
for (const id of workorders.keys()) walk(id, [])
for (const cycle of cycles) errors.push(`dependency cycle: ${cycle}`)

if (strict && workorders.size > 12) {
  if (!/^##\s+(Execution|Delivery) Waves/im.test(plan)) {
    errors.push("more than 12 workorders requires an Execution Waves or Delivery Waves section")
  }
  for (const [packet, packetWorkorders] of reviewPackets) {
    if (packetWorkorders.length > 7) errors.push(`review_packet ${packet} has ${packetWorkorders.length} workorders; max 7`)
  }
}

function stateScalar(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return state.match(new RegExp(`^\\s*${escaped}:\\s*([^#\\n]+)`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '')
}

function stateNumber(name) {
  const value = stateScalar(name)
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : Number.NaN
}

function stateBoolean(name) {
  const value = stateScalar(name)
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

const stateVersion = stateScalar('aird_state_version')
const stateStatus = stateScalar('status')
const packageClass = stateScalar('package_class')
const supportingPackageApproved = stateBoolean('supporting_package_user_approved')
const implementationReadiness = stateScalar('ready_for_implementation')
const runtimeReadiness = stateScalar('ready_for_runtime_verification')
const releaseReadiness = stateScalar('ready_for_release')
const productStarted = stateBoolean('product_implementation_started')
const productFilesChanged = stateNumber('product_files_changed')
const firstVerticalSlice = stateScalar('first_vertical_slice')
const supportingWip = stateNumber('supporting_wip')
const supportingUsed = stateNumber('supporting_workorders_used')
const supportingPercent = stateNumber('supporting_delivery_percent')
const cyclesWithoutValue = stateNumber('cycles_without_user_value')
const minutesWithoutValue = stateNumber('minutes_without_user_value')
const detourApproved = stateBoolean('user_approved_overrun')
const checkpointMode = stateScalar('checkpoint_mode')
const contextMeasurement = stateScalar('context_measurement')
const contextUsedPercent = stateNumber('context_used_percent')
const sessionElapsedMinutes = stateNumber('session_elapsed_minutes')
const airdCyclesSinceChoice = stateNumber('aird_cycles_since_user_choice')
const workordersSinceChoice = stateNumber('workorders_completed_since_user_choice')
const lastWarningElapsedMinutes = stateNumber('last_warning_elapsed_minutes')
const lastWarningContextPercent = stateNumber('last_warning_context_percent')
const workerMinutesWithoutTest = stateNumber('worker_minutes_without_focused_test')
const firstFocusedTestAt = stateScalar('first_focused_test_at')
const checkpointWarningActive = stateBoolean('checkpoint_warning_active')
const checkpointRecommendation = stateScalar('checkpoint_recommendation')
const userCheckpointDecision = stateScalar('user_checkpoint_decision')

if (strict) {
  if (stateVersion !== '2.0') errors.push('STATE requires aird_state_version 2.0 in strict V3 mode')
  if (!['product', 'supporting'].includes(packageClass)) errors.push(`STATE invalid package_class ${packageClass}`)
  if (packageClass === 'supporting' && supportingPackageApproved !== true) {
    errors.push('separate supporting AIRD package requires explicit user approval')
  }
  if (!['blocked', 'ready'].includes(implementationReadiness)) {
    errors.push(`STATE invalid ready_for_implementation ${implementationReadiness}`)
  }
  if (!['blocked', 'ready', 'not_required'].includes(runtimeReadiness)) {
    errors.push(`STATE invalid ready_for_runtime_verification ${runtimeReadiness}`)
  }
  if (!['blocked', 'ready'].includes(releaseReadiness)) {
    errors.push(`STATE invalid ready_for_release ${releaseReadiness}`)
  }
  const implementationStatuses = ['ready_for_delivery', 'in_delivery', 'implementation_complete', 'verifying', 'ready_for_release', 'complete']
  if (implementationStatuses.includes(stateStatus) && implementationReadiness !== 'ready') {
    errors.push(`STATE status ${stateStatus} requires ready_for_implementation: ready`)
  }
  if (stateStatus === 'verifying' && !['ready', 'not_required'].includes(runtimeReadiness)) {
    errors.push('STATE status verifying requires ready_for_runtime_verification: ready|not_required')
  }
  if (['ready_for_release', 'complete'].includes(stateStatus) && releaseReadiness !== 'ready') {
    errors.push(`STATE status ${stateStatus} requires ready_for_release: ready`)
  }
  if (releaseReadiness === 'ready' && !['ready', 'not_required'].includes(runtimeReadiness)) {
    errors.push('ready_for_release: ready requires runtime verification readiness or not_required')
  }
  for (const [name, value] of [
    ['product_files_changed', productFilesChanged],
    ['supporting_wip', supportingWip],
    ['supporting_workorders_used', supportingUsed],
    ['supporting_delivery_percent', supportingPercent],
    ['cycles_without_user_value', cyclesWithoutValue],
    ['minutes_without_user_value', minutesWithoutValue],
  ]) {
    if (!Number.isInteger(value) || value < 0) errors.push(`STATE ${name} must be a non-negative integer`)
  }
  if (productFilesChanged > 0 && productStarted !== true) {
    errors.push('STATE product files changed but product_implementation_started is false')
  }
  if (!['pending', 'in_progress', 'functional'].includes(firstVerticalSlice)) {
    errors.push(`STATE invalid first_vertical_slice ${firstVerticalSlice}`)
  }
  if (firstVerticalSlice === 'functional' && (productStarted !== true || productFilesChanged < 1)) {
    errors.push('STATE functional first vertical slice requires started implementation and product files')
  }
  if ((supportingUsed > 1 || supportingPercent > 20) && detourApproved !== true) {
    errors.push('supporting detour exceeded one workorder or 20 percent without user approval')
  }

  if (checkpointMode === undefined) {
    warnings.push('STATE lacks warn-only session checkpoint telemetry')
  } else {
    if (checkpointMode !== 'warn_only') errors.push(`STATE invalid checkpoint_mode ${checkpointMode}`)
    if (!['unavailable', 'observed', 'estimated'].includes(contextMeasurement)) {
      errors.push(`STATE invalid context_measurement ${contextMeasurement}`)
    }
    for (const [name, value] of [
      ['context_used_percent', contextUsedPercent],
      ['session_elapsed_minutes', sessionElapsedMinutes],
      ['aird_cycles_since_user_choice', airdCyclesSinceChoice],
      ['workorders_completed_since_user_choice', workordersSinceChoice],
      ['last_warning_elapsed_minutes', lastWarningElapsedMinutes],
      ['last_warning_context_percent', lastWarningContextPercent],
      ['worker_minutes_without_focused_test', workerMinutesWithoutTest],
    ]) {
      if (!Number.isInteger(value) || value < 0) errors.push(`STATE ${name} must be a non-negative integer`)
    }
    if (contextUsedPercent > 100 || lastWarningContextPercent > 100) {
      errors.push('STATE context percentages must be between 0 and 100')
    }
    if (![true, false].includes(checkpointWarningActive)) {
      errors.push('STATE checkpoint_warning_active must be true or false')
    }
    if (!['none', 'continue_current', 'start_fresh'].includes(checkpointRecommendation)) {
      errors.push(`STATE invalid checkpoint_recommendation ${checkpointRecommendation}`)
    }
    if (!['not_requested', 'continue_current', 'start_fresh'].includes(userCheckpointDecision)) {
      errors.push(`STATE invalid user_checkpoint_decision ${userCheckpointDecision}`)
    }

    const checkpointReasons = []
    if (['observed', 'estimated'].includes(contextMeasurement) &&
        contextUsedPercent >= 60 && contextUsedPercent - lastWarningContextPercent >= 10) {
      checkpointReasons.push(`context ${contextUsedPercent}%`)
    }
    if (sessionElapsedMinutes >= 45 && sessionElapsedMinutes - lastWarningElapsedMinutes >= 30) {
      checkpointReasons.push(`session ${sessionElapsedMinutes} minutes`)
    }
    if (airdCyclesSinceChoice >= 2) checkpointReasons.push(`${airdCyclesSinceChoice} AIRD cycles`)
    if (workordersSinceChoice >= 2) checkpointReasons.push(`${workordersSinceChoice} completed workorders`)
    if (workerMinutesWithoutTest >= 30 && !firstFocusedTestAt) {
      checkpointReasons.push(`${workerMinutesWithoutTest} worker minutes without focused test`)
    }
    if (checkpointReasons.length && checkpointWarningActive !== true) {
      warnings.push(`STATE checkpoint warning due: ${checkpointReasons.join(', ')}`)
    }
    if (checkpointWarningActive === true && userCheckpointDecision === 'not_requested') {
      warnings.push('STATE checkpoint warning awaits user choice: continue_current or start_fresh')
    }
  }
}

const actualReady = [...workorders.values()].filter((item) => item.status === 'ready').length
const actualInProgress = [...workorders.values()].filter((item) => item.status === 'in_progress').length
const actualDone = [...workorders.values()].filter((item) => item.status === 'done').length
const actualSupportingWip = [...workorders.values()].filter((item) => item.workClass === 'supporting' && item.status === 'in_progress').length
const actualSupportingUsed = [...workorders.values()].filter((item) => item.workClass === 'supporting' && ['ready', 'in_progress', 'done'].includes(item.status)).length
const actualProductStarted = [...workorders.values()].some((item) => item.workClass === 'product' && ['in_progress', 'done'].includes(item.status))

if (strict) {
  if (supportingWip !== actualSupportingWip) errors.push(`STATE supporting_wip=${supportingWip}, frontmatter=${actualSupportingWip}`)
  if (supportingUsed < actualSupportingUsed) errors.push(`STATE supporting_workorders_used=${supportingUsed}, frontmatter requires at least ${actualSupportingUsed}`)
  if (actualProductStarted && productStarted !== true) errors.push('product work started but STATE product_implementation_started is false')
  if (actualSupportingUsed > 1 && detourApproved !== true) errors.push('more than one supporting workorder requires user-approved detour overrun')
}

const stateTotal = stateNumber('workorders_total')
const stateReady = stateNumber('workorders_ready')
const stateInProgress = stateNumber('workorders_in_progress')
const stateDone = stateNumber('workorders_done')
if (Number.isFinite(stateTotal) && stateTotal !== workorders.size) {
  errors.push(`STATE workorders_total=${stateTotal}, filesystem=${workorders.size}`)
}
if (strict && stateReady !== actualReady) {
  errors.push(`STATE workorders_ready=${stateReady}, frontmatter=${actualReady}`)
}
if (strict && stateInProgress !== actualInProgress) {
  errors.push(`STATE workorders_in_progress=${stateInProgress}, frontmatter=${actualInProgress}`)
}
if (strict && stateDone !== actualDone) {
  errors.push(`STATE workorders_done=${stateDone}, frontmatter=${actualDone}`)
}

for (const [relativePath, markdown] of [
  ["STATE.md", state],
  ["07-implementation-plan.md", plan],
  ["08-quality-gates.md", gates],
  ["09-dod.md", dod],
]) {
  const countClaims = [...markdown.matchAll(/(?:exactly|all|materialized(?:\s+set)?(?:\s+is)?[:\s]+)(\d+)\s+workorders/gi)]
  for (const claim of countClaims) {
    if (Number(claim[1]) !== workorders.size) {
      errors.push(`${relativePath}: stale workorder count ${claim[1]} (filesystem ${workorders.size})`)
    }
  }
}

const riskIdsInPackage = ids(riskRegister, /R-\d+/g)
const gateIdsInPackage = ids(gates, /G-\d+/g)
const dodIdsInPackage = ids(dod, /DOD-\d+/g)
const riskIdsInWorkorders = [...new Set([...workorders.values()].flatMap((item) => item.riskIds))]
const gateIdsInWorkorders = [...new Set([...workorders.values()].flatMap((item) => item.gateIds))]
const dodIdsInWorkorders = [...new Set([...workorders.values()].flatMap((item) => item.dodIds))]

if (strict) {
  for (const riskId of riskIdsInPackage) if (!riskIdsInWorkorders.includes(riskId)) warnings.push(`risk has no direct workorder owner: ${riskId}`)
  for (const gateId of gateIdsInPackage) if (!gateIdsInWorkorders.includes(gateId)) warnings.push(`gate is release/verification-owned rather than workorder-owned: ${gateId}`)
  for (const dodId of dodIdsInPackage) if (!dodIdsInWorkorders.includes(dodId)) warnings.push(`DoD item has no direct workorder owner: ${dodId}`)
  for (const riskId of riskIdsInWorkorders) if (!riskIdsInPackage.includes(riskId)) errors.push(`workorder references unknown risk: ${riskId}`)
  for (const gateId of gateIdsInWorkorders) if (!gateIdsInPackage.includes(gateId)) errors.push(`workorder references unknown gate: ${gateId}`)
  for (const dodId of dodIdsInWorkorders) if (!dodIdsInPackage.includes(dodId)) errors.push(`workorder references unknown DoD: ${dodId}`)
}

const gateMap = mapping(gates, /G-\d+/g, /DOD-\d+/g, /Gate\s*(?:->|→).*DoD/i)
const dodMap = mapping(dod, /DOD-\d+/g, /G-\d+/g, /DoD\s*(?:->|→).*Gate/i)
if (!gateMap.size || !dodMap.size) {
  const message = "missing parseable authoritative Gate↔DoD mapping tables"
  if (strict) errors.push(message)
  else warnings.push(message)
} else {
  for (const [gateId, mappedDodIds] of gateMap) {
    for (const dodId of mappedDodIds) {
      const reverse = dodMap.get(dodId) || []
      if (!reverse.includes(gateId)) errors.push(`mapping mismatch: ${gateId} -> ${dodId} has no reverse`)
    }
  }
  for (const [dodId, mappedGateIds] of dodMap) {
    for (const gateId of mappedGateIds) {
      const forward = gateMap.get(gateId) || []
      if (!forward.includes(dodId)) errors.push(`mapping mismatch: ${dodId} -> ${gateId} has no forward`)
    }
  }
}

const profile = state.match(/discovery_profile:\s*['"]?([a-z]+)['"]?/)?.[1] || "legacy-unspecified"
console.log(`AIRD lint: ${packageDir}`)
console.log(`  mode: ${strict ? "strict-schema" : "legacy-compatible"}`)
console.log(`  profile: ${profile}`)
console.log(`  workorders: ${workorders.size} | packets: ${reviewPackets.size} | cycles: ${cycles.size}`)
console.log(`  risks: ${riskIdsInPackage.length} | gates: ${gateIdsInPackage.length} | DoD: ${dodIdsInPackage.length}`)

for (const warning of warnings) console.log(`  WARN  ${warning}`)
for (const error of errors) console.error(`  ERROR ${error}`)

if (errors.length) {
  console.error(`FAIL (${errors.length} errors, ${warnings.length} warnings)`)
  process.exit(1)
}

console.log(`PASS (${warnings.length} warnings)`)
