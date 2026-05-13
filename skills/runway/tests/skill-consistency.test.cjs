const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');

function read(relativePath) {
  // Skill directories live under skills/ after plugin restructuring.
  // Paths starting with a skill name are remapped; repo-root files (README.md,
  // hooks/, install.sh) are resolved directly from the repo root.
  const SKILL_NAMES = [
    'runway/', 'runway-prd-analysis/', 'runway-tech-design/', 'runway-task-planning/',
    'runway-parallel-dev/', 'runway-code-review-fix/', 'runway-qa-verify/',
    'runway-autotest/', 'runway-bug-analysis/', 'runway-shepherd/',
  ];
  const needsPrefix = SKILL_NAMES.some((s) => relativePath.startsWith(s));
  const resolved = needsPrefix ? path.join('skills', relativePath) : relativePath;
  return fs.readFileSync(path.join(REPO_ROOT, resolved), 'utf8');
}

test('Stage 1 and Stage 2 completion output includes both xuecheng IDs and links', () => {
  const orchestrator = read('runway/SKILL.md');

  assert.match(orchestrator, /✅ Stage 1 完成 — 需求规格/);
  assert.match(orchestrator, /- 学城ID：\{requirements_spec_contentId\}/);
  assert.match(orchestrator, /- 学城链接：https:\/\/km\.sankuai\.com\/collabpage\/\{requirements_spec_contentId\}/);
  assert.match(orchestrator, /✅ Stage 2 完成 — 技术方案/);
  assert.match(orchestrator, /- 学城ID：\{tech_spec_contentId\}/);
  assert.match(orchestrator, /- 学城链接：https:\/\/km\.sankuai\.com\/collabpage\/\{tech_spec_contentId\}/);
});

test('Stage 3/5 docs stay aligned with 12-stage auto-advance semantics', () => {
  const orchestrator = read('runway/SKILL.md');
  const planning = read('runway-task-planning/SKILL.md');
  const parallelDev = read('runway-parallel-dev/SKILL.md');

  // State Tracking now documents 4 pipeline modes (standard/lite/fullstack/litefull)
  assert.match(orchestrator, /pipeline_mode=standard.*or.*lite.*→ Stage 3/s);
  assert.match(orchestrator, /pipeline_mode=fullstack.*or.*litefull.*with `fullstack_handoff_status=pending` → invoke `runway-fullstack` and stop/s);
  assert.match(orchestrator, /pipeline_mode=fullstack.*or.*litefull.*with `fullstack_handoff_status=dispatched` → must not enter local Stage 3 again/s);
  assert.match(planning, /auto-advance into Stage 4 branch creation/);
  assert.doesNotMatch(parallelDev, /confirmed plan/i);
});

test('Stage 1-3 artifacts stay split between spec, design review, and execution plan', () => {
  const orchestrator = read('runway/SKILL.md');
  // tech-design: Artifact Boundary and section descriptions are in main SKILL.md
  const techDesign = read('runway-tech-design/SKILL.md');
  // ADR and section structure details live in references after refactor
  const admissionRules = read('runway-tech-design/references/admission-rules.md');
  const techTemplate = read('runway-tech-design/references/tech-spec-template.md');
  const planning = read('runway-task-planning/SKILL.md');
  const readme = read('README.md');

  // Pipeline route table references key stage artifacts
  assert.match(orchestrator, /requirements_spec_content_id/);
  assert.match(orchestrator, /tech_spec_content_id/);
  assert.match(orchestrator, /plan_path/);
  assert.match(readme, /4\. Design the technical solution/);
  assert.match(readme, /5\. \*\*\[Pause\]\*\* Wait for your review and approval/);
  assert.match(readme, /6\. Generate the implementation plan, optionally sync APIs to PAPI, and optionally generate test cases/);
  assert.match(readme, /7\. Hand off to ee-ones for feature branch creation/);
  assert.match(readme, /8\. Execute development in parallel waves with two-phase review/);

  assert.match(techDesign, /Stage 2 produces a review-friendly tech spec, not an executable implementation plan\./);
  assert.match(techDesign, /Keep outward-facing interface\/API contract changes in this document, but leave internal parameter details, concrete class names, file paths, field numbers, test code, Wave splitting, and TDD task steps to runway-task-planning\./);
  // Section boundary descriptions are in the Artifact Boundary section of main SKILL.md
  assert.match(techDesign, /\*\*二、详细设计\*\* — 只写实现方案、业务逻辑、关键流程、状态变化、模块边界/);
  assert.match(techDesign, /\*\*三、接口协议变更\*\* — 只写对外请求\/响应或契约变化、兼容性说明/);
  assert.doesNotMatch(techDesign, /\*\*方案摘要\*\* —/);
  assert.doesNotMatch(techDesign, /\*\*设计原则（Principles）\*\*/);
  assert.doesNotMatch(techDesign, /\*\*四、发布与风险控制\*\*/);
  assert.doesNotMatch(techDesign, /\*\*每个模块\*\* — .*接口契约（Interfaces）/);
  assert.doesNotMatch(techDesign, /\*\*七、任务规划交接说明\*\*/);
  // ADR trigger rules now live in references/admission-rules.md
  assert.match(admissionRules, /ADR is optional/);
  assert.match(admissionRules, /七、架构ADR/);
  assert.match(techTemplate, /## 三、接口协议变更/);
  assert.match(techTemplate, /## 七、架构ADR/);
  assert.match(techTemplate, /\| 方案对比 \| 选型依据 \| 决策理由 \|/);
  assert.doesNotMatch(techTemplate, /\*\*接口设计（Interfaces）：\*\*/);
  assert.doesNotMatch(techTemplate, /## 七、任务规划交接说明/);
  assert.doesNotMatch(techTemplate, /第七节任务规划交接说明/);

  // task-planning now reads spec_context instead of tech spec chapters
  assert.match(planning, /Read `spec_context_path` from checkpoint/);
  assert.match(planning, /Do not treat spec_context as file-level implementation truth/);
});

test('Stage 3 reads spec_context and maps interfaces + business rules to tasks', () => {
  const planning = read('runway-task-planning/SKILL.md');
  const planTemplate = read('runway-task-planning/references/plan-template.md');
  const planChecklist = read('runway-task-planning/references/plan-review-checklist.md');
  const handoff = read('runway/references/stage-handoff.md');

  // task-planning now reads spec_context (interface design + business rules) instead of tech spec chapters
  assert.match(planning, /Read `spec_context_path` from checkpoint/);
  assert.match(planning, /接口设计.*每个接口映射到至少一个实现任务/s);
  assert.match(planning, /业务规则.*每条规则映射到参数校验\/错误码任务/s);

  // 6-chapter mapping has been removed; plan-template uses spec_context
  assert.match(planTemplate, /Spec Context/);
  assert.doesNotMatch(planTemplate, /## 设计项 → 计划项映射/);
  assert.doesNotMatch(planTemplate, /\| 来源章节 \| 设计项 \| 对应任务 \/ Wave \/ blocker \| 处理状态 \|/);

  // Stage 2→3 Handoff Coverage section removed from checklist
  assert.doesNotMatch(planChecklist, /Stage 2.*3 Handoff Coverage/);
  assert.doesNotMatch(planChecklist, /`二、详细设计` 的每个模块均已被任务覆盖或写明原因/);

  // stage-handoff.md updated: spec_context_path is the Stage 3 input
  assert.match(handoff, /spec_context_path/);
  assert.doesNotMatch(handoff, /runway-task-planning handoff notes/);
});

test('Tech design keeps ADR optional and enforces a readability gate', () => {
  // ADR rules moved to references/admission-rules.md after refactor
  const admissionRules = read('runway-tech-design/references/admission-rules.md');
  // Readability gate lives in references/self-review-checklist.md
  const selfReview = read('runway-tech-design/references/self-review-checklist.md');
  const techTemplate = read('runway-tech-design/references/tech-spec-template.md');

  assert.match(admissionRules, /ADR is optional/);
  assert.match(admissionRules, /ADR Trigger Rule|ADR trigger/);
  assert.match(selfReview, /Readability check — can a reviewer read this in 10 minutes and decide\?/);
  assert.match(techTemplate, /这是给人 review 的技术方案，不是执行计划。/);
  assert.match(techTemplate, /不要写代码、字段编号、文件路径、Wave \/ TDD 步骤。/);
  assert.match(techTemplate, /## 七、架构ADR/);
  assert.doesNotMatch(techTemplate, /## 方案摘要/);
  assert.doesNotMatch(techTemplate, /### 设计原则（Principles）/);
  assert.doesNotMatch(techTemplate, /## 四、发布与风险控制/);
});

test('Non-triggered ADR stays in normal sections and never appears as ADR-labeled output', () => {
  // ADR rules moved to references/admission-rules.md after refactor
  const admissionRules = read('runway-tech-design/references/admission-rules.md');
  const techTemplate = read('runway-tech-design/references/tech-spec-template.md');

  assert.match(admissionRules, /If none apply, keep rationale in the tech spec only/);
  assert.match(admissionRules, /when ADR is not triggered|ADR is not triggered/i);
  assert.match(admissionRules, /七、架构ADR/);
  assert.match(techTemplate, /未触发 ADR 时：可在相关必填章节保留普通决策理由，但不要出现 `ADR` 标签、`七、架构ADR` 节名或 ADR 决策表样式。/);
});

test('Stage 2 progress displays are non-blocking until the real Hard Gate', () => {
  const techDesign = read('runway-tech-design/SKILL.md');
  // Convergence rules (including progress display format) moved to references/review-convergence.md
  const reviewConvergence = read('runway-tech-design/references/review-convergence.md');

  // review-convergence.md contains progress display rules
  assert.match(reviewConvergence, /Progress Display Rules/);
  assert.match(reviewConvergence, /Planner 草稿完成（第 N 轮）/);
  assert.match(reviewConvergence, /After each Architect pass/);
  assert.match(reviewConvergence, /After each Critic pass/);
  assert.match(techDesign, /## Step 6: User Review \(HARD GATE\)/);
  assert.match(techDesign, /Loop lifecycle:[\s\S]*?Deactivate it only \*\*after\*\* explicit Hard Gate approval and successful xuecheng upload\./s);
});

test('Stage 2 only allows Hard Gate or real blockers to pause execution', () => {
  const techDesign = read('runway-tech-design/SKILL.md');
  // Convergence/revision rules moved to references/review-convergence.md
  const reviewConvergence = read('runway-tech-design/references/review-convergence.md');

  assert.match(techDesign, /Only Step 6 \(User Review\) is a user pause point\. Steps 1-5 and Step 7 must continue in the same turn unless a true blocker is hit\./);
  assert.match(techDesign, /After Step 1 and Step 2 complete, continue directly into the admitted review path in the same turn\. Do not stop after scan results, admission choice, or exploration notes\./);
  assert.match(techDesign, /When using subagents, await each required result and continue in the same turn\. Do not stop after dispatching Planner, Architect, or Critic\./);
  assert.match(reviewConvergence, /Treat the revision as an internal repair step; continue immediately/);
  assert.match(techDesign, /Step 4 \(deliberate mode\) and Step 5 \(self-review\) are internal quality steps, not review pauses or confirmation points\./);
  assert.match(reviewConvergence, /If unresolved issues remain after the allowed review cycles, include them in the Step 6 Hard Gate presentation/);
  assert.match(techDesign, /Do not ask the user whether to continue before Step 6\. Do not wait for "继续" or similar confirmation before the Hard Gate\./);
});

test('Stage 2 defaults to lightweight admission and narrows heavy review and ADR triggers', () => {
  const techDesign = read('runway-tech-design/SKILL.md');
  // Admission rules moved to references/admission-rules.md; convergence rules to review-convergence.md
  const admissionRules = read('runway-tech-design/references/admission-rules.md');
  const reviewConvergence = read('runway-tech-design/references/review-convergence.md');
  const orchestrator = read('runway/SKILL.md');
  const readme = read('README.md');
  const troubleshooting = read('runway/references/troubleshooting.md');

  assert.match(techDesign, /3-level admission model/);
  assert.match(admissionRules, /Level 0 \(default\).*Planner only/s);
  assert.match(admissionRules, /Level 1.*Planner → Architect/s);
  assert.match(admissionRules, /Level 2.*Planner → Architect → Critic/s);
  assert.match(reviewConvergence, /at most one revision cycle/i);
  assert.match(reviewConvergence, /2 total cycles/);
  assert.match(techDesign, /Start with a quick admission scan rather than the full Code Reality Report/);
  assert.match(techDesign, /Level 0 should stay on a focused exploration path: only inspect the exact modules, contracts, and dependencies needed to draft the current solution/);
  assert.match(techDesign, /Only Level 1\/2, or Level 0 work with clear unresolved uncertainty, should expand into the full Code Reality Report/);
  assert.doesNotMatch(techDesign, /Runs a Planner→Architect→Critic consensus loop/);
  assert.doesNotMatch(techDesign, /The triangle loop needs more than 2 rounds to converge/);
  assert.doesNotMatch(techDesign, /Deliberate mode was triggered/);

  assert.match(orchestrator, /admission-based review path/);
  assert.match(readme, /lightweight-by-default review path/);
  assert.match(troubleshooting, /Level 2 review not converging within 2 cycles/);
});

test('Stage 2 keeps Level 0 documentation concise while preserving the review-ready artifact', () => {
  const techDesign = read('runway-tech-design/SKILL.md');

  assert.match(techDesign, /Stage 2 still produces the same review-friendly tech spec artifact for every level; lightweight mode changes depth, not deliverable type\./);
  assert.match(techDesign, /For Level 0, prefer concise section content grounded in repo facts instead of exhaustive inventories or reviewer-style essays\./);
  assert.match(techDesign, /If a required section has no meaningful change, write a brief explicit reason rather than expanding it for completeness theatre\./);
});

test('Stage 2 interface protocol section stays lightweight but field-explicit', () => {
  const techDesign = read('runway-tech-design/SKILL.md');
  // Planner prompts with field-explicit interface rules live in references/review-agent-prompts.md
  const reviewAgentPrompts = read('runway-tech-design/references/review-agent-prompts.md');
  // Self-review checklist (field-level checks) moved to references/self-review-checklist.md
  const selfReview = read('runway-tech-design/references/self-review-checklist.md');
  const techTemplate = read('runway-tech-design/references/tech-spec-template.md');

  assert.match(techDesign, /Keep outward-facing interface\/API contract changes in this document, but leave internal parameter details, concrete class names, file paths, field numbers, test code, Wave splitting, and TDD task steps to runway-task-planning\./);
  // Interface protocol details live in Planner prompts
  assert.match(reviewAgentPrompts, /按对外接口 \/ API 逐项列出，明确写出改的是哪个接口/);
  assert.match(reviewAgentPrompts, /不要用大段文字笼统概括接口变更/);
  assert.match(techDesign, /若只是模块内参数、内部 RPC、内部事件、内部数据结构调整，不写在这里/);
  // Field-level self-review checks now in references/self-review-checklist.md
  assert.match(selfReview, /每个新增\/修改\/删除字段已写清字段名、数据类型、字段含义/);

  assert.match(techTemplate, /本层回答：\*\*对外接口 \/ API 契约怎么变。\*\*/);
  assert.match(techTemplate, /不要写内部 RPC、内部事件、模块内参数细节/);
  assert.match(techTemplate, /对外暴露的 Thrift\/RPC 能力.*必须写在这里/s);
  assert.match(techTemplate, /#### Request \/ Input 字段变更/);
  assert.match(techTemplate, /#### Response \/ Output 字段变更/);
  assert.match(techTemplate, /\| 字段名 \| 类型 \| 变更 \|/);
  assert.doesNotMatch(techTemplate, /对外或跨模块契约/);
  assert.doesNotMatch(techTemplate, /HTTP API \/ RPC \/ Event \/ DTO \/ 其他/);
});

test('Stage skills use runway-tools state-update instead of inline state deactivation edits', () => {
  const parallelDev = read('runway-parallel-dev/SKILL.md');
  const codeReview = read('runway-code-review-fix/SKILL.md');
  const techDesign = read('runway-tech-design/SKILL.md');

  assert.doesNotMatch(parallelDev, /sed 's\/\^active: true\/active: false\//);
  assert.doesNotMatch(codeReview, /sed 's\/\^active: true\/active: false\//);
  assert.doesNotMatch(techDesign, /rm -f \.claude\/runway-state\/triangle-loop\.local\.md/);
  assert.match(parallelDev, /state-update --root "\$PROJECT_ROOT" --name pipeline\.local\.md --active false/);
  assert.match(codeReview, /state-update --root "\$PROJECT_ROOT" --name pipeline\.local\.md --active false/);
  // tech-design state-update is in Step 7 (after xuecheng upload)
  assert.match(techDesign, /state-update --root "\$PROJECT_ROOT" --name triangle-loop\.local\.md --active false/);
});

test('Stage 5 startup and progress updates are non-blocking until real blocker conditions', () => {
  const parallelDev = read('runway-parallel-dev/SKILL.md');
  const orchestrator = read('runway/SKILL.md');
  const readme = read('README.md');
  const troubleshooting = read('runway/references/troubleshooting.md');

  assert.match(parallelDev, /After Step 1 completes, dispatch Wave 1 in the same turn\. Do not stop after reading the plan, printing tracker details, or summarizing the wave layout\./);
  assert.match(parallelDev, /Subagent dispatch, in-flight task status, review handoffs, and wave banners are progress updates, not user pause points\./);
  assert.match(parallelDev, /Do not ask the user whether to start the first wave, whether to continue after a task finishes, or whether to proceed after a progress banner\./);
  assert.match(parallelDev, /A task-level `BLOCKED` state is not by itself a Stage 5 user pause point\. Record it, continue other runnable tasks in the same wave, and pause the stage only if Step 4's allowed conditions are later met\./);
  assert.match(parallelDev, /NEEDS_CONTEXT retries, spec-review repair rounds, and code-quality fix rounds are internal execution loops, not user review gates\./);
  assert.match(parallelDev, /Do not ask the user for confirmation between implementer → spec review → code quality review hops unless an explicit Step 4 pause condition is reached\./);
  assert.match(parallelDev, /Execution Report generation and Stage 5 → Stage 6 handoff are not review gates\. Save the report, return control to the orchestrator, and let the pipeline continue in the same turn unless an allowed pause condition was hit\./);

  assert.match(orchestrator, /Do not stop after Stage 5 skill startup, plan load, tracker creation, wave banners, or execution-report packaging\. Those are internal progress events, not user approval points\./);
  assert.match(orchestrator, /After Stage 5 returns a completed execution report, continue directly into Stage 6 in the same turn unless Stage 5 explicitly paused under its allowed blocker conditions\./);

  assert.match(readme, /Stage 5 has no review gate: plan load, tracker creation, wave banners, and execution-report packaging should auto-continue unless a real blocker stops the pipeline\./);
  assert.match(troubleshooting, /If Stage 5 appears to stop right after startup, tracker creation, a wave banner, or execution-report packaging, treat it as a contract bug — those moments are progress updates, not pause points\./);
});


test('Stop hook only protects the pipeline loop from accidental exit', () => {
  const stopHook = read('hooks/runway-stop-hook.sh');

  assert.match(stopHook, /# runway: Stop hook — keeps the Stage 5-12 pipeline loop running/);
  assert.doesNotMatch(stopHook, /TRIANGLE_STATE=/);
  assert.doesNotMatch(stopHook, /both triangle and pipeline states active/);
  assert.match(stopHook, /if ! is_active "\$PIPELINE_STATE"; then/);
  assert.match(stopHook, /STATE_FILE="\$PIPELINE_STATE"/);
  assert.match(stopHook, /Transcript shape is NOT used to decide whether to keep blocking\./);
  assert.match(stopHook, /Active state is the authoritative signal — if active:true, keep blocking regardless/);
  assert.doesNotMatch(stopHook, /transcript not found, clearing and allowing exit/);
  assert.doesNotMatch(stopHook, /no assistant messages in transcript, clearing and allowing exit/);
  assert.doesNotMatch(stopHook, /empty assistant output \(no text, no tool_use\), clearing and allowing exit/);
  assert.doesNotMatch(stopHook, /triangle \+ pipeline loops/);
});

test('README and troubleshooting explain triangle resume vs pipeline stop-hook protection', () => {
  const readme = read('README.md');
  const handoff = read('runway/references/stage-handoff.md');
  const troubleshooting = read('runway/references/troubleshooting.md');

  assert.match(readme, /triangle-loop\.local\.md.*should not block user exit/s);
  assert.match(readme, /pipeline\.local\.md.*Stop hook protects this loop/s);
  assert.match(handoff, /triangle-loop\.local\.md.*should not block user exit/s);
  assert.match(handoff, /pipeline\.local\.md.*Stop hook protects this loop/s);
  assert.match(troubleshooting, /Only the Stage 5-12 pipeline loop should trigger Stop-hook exit protection/);
});

test('Workflow docs avoid project-specific ThriftField handling', () => {
  const planning = read('runway-task-planning/SKILL.md');
  const planTemplate = read('runway-task-planning/references/plan-template.md');
  const planChecklist = read('runway-task-planning/references/plan-review-checklist.md');
  const planningVerification = read('runway-task-planning/references/dependency-verification.md');
  const parallelVerification = read('runway-parallel-dev/references/dependency-verification.md');

  assert.doesNotMatch(planning, /Thrift field/i);
  assert.doesNotMatch(planTemplate, /Thrift|Protobuf|@ThriftField/);
  assert.doesNotMatch(planChecklist, /Thrift|Protobuf|field number/i);
  assert.doesNotMatch(planningVerification, /Thrift|Protobuf|@ThriftField/);
  assert.doesNotMatch(parallelVerification, /Thrift|Protobuf|@ThriftField/);
});

test('Stage 1 spec hands off design inputs without turning into technical design', () => {
  const prdAnalysis = read('runway-prd-analysis/SKILL.md');
  const specTemplate = read('runway-prd-analysis/references/spec-template.md');

  assert.doesNotMatch(prdAnalysis, /技术设计交接说明/);
  assert.doesNotMatch(specTemplate, /技术设计交接说明/);
  assert.match(prdAnalysis, /技术设计关注点/);
  assert.match(specTemplate, /技术设计关注点/);
  assert.match(prdAnalysis, /Only include unresolved requirements, external dependencies, boundary constraints, or risks that Stage 2 must explicitly carry forward\./);
  assert.match(prdAnalysis, /Do not write solution proposals, module designs, interface designs, data models, or implementation steps here\./);
  assert.match(specTemplate, /- \{未决但会影响技术设计的需求点、假设或待确认项\}/);
  assert.match(specTemplate, /- \{需要延续关注的外部依赖、集成约束或边界条件\}/);
  assert.match(specTemplate, /- \{已知风险或需要技术设计阶段提前验证的事项\}/);
  assert.match(specTemplate, /> 不要在这里写方案、模块设计、接口设计、数据模型或实现步骤。/);
});

test('Knowledge injection steps exist in every stage that consumes project knowledge', () => {
  const prdAnalysis = read('runway-prd-analysis/SKILL.md');
  const techDesign = read('runway-tech-design/SKILL.md');
  const taskPlanning = read('runway-task-planning/SKILL.md');
  const parallelDev = read('runway-parallel-dev/SKILL.md');

  // Each consuming stage must load knowledge before its core work begins
  assert.match(prdAnalysis, /knowledge-read --root "\$PROJECT_ROOT" --inject-into-stage 1/);
  // tech-design knowledge injection is in Step 0.5 (main SKILL.md)
  assert.match(techDesign, /knowledge-read.*--inject-into-stage 2/);
  // task-planning knowledge injection is in Step 0.5
  assert.match(taskPlanning, /knowledge-read.*--inject-into-stage 3/);
  assert.match(parallelDev, /knowledge-read.*--inject-into-stage 5/);

  // Stage 5 implementer prompt must have a Known Project Pitfalls field
  const implementerPrompt = read('runway-parallel-dev/references/implementer-prompt.md');
  assert.match(implementerPrompt, /## Known Project Pitfalls/);
  assert.match(implementerPrompt, /KNOWLEDGE_S5/);
});

test('Hard Gate knowledge capture follows the extract-present-confirm-write sequence', () => {
  const prdAnalysis = read('runway-prd-analysis/SKILL.md');
  // tech-design knowledge capture moved to references/knowledge-capture.md
  const techDesign = read('runway-tech-design/SKILL.md');
  const knowledgeCapture = read('runway-tech-design/references/knowledge-capture.md');

  // prd-analysis: check main SKILL.md
  assert.match(prdAnalysis, /cat > \.runway\/tmp\/spec-draft-stage\d\.md/,
    'prd-analysis: must save draft snapshot before presenting');
  assert.match(prdAnalysis, /Present findings to the user for confirmation/,
    'prd-analysis: must present findings to user');
  assert.match(prdAnalysis, /Wait for the user.s response before writing anything/,
    'prd-analysis: must wait for user response before writing');
  assert.match(prdAnalysis, /跳过，不沉淀/,
    'prd-analysis: must offer a skip option');
  assert.match(prdAnalysis, /After the user confirms.*write each approved entry/s,
    'prd-analysis: must write only after user confirms');
  assert.match(prdAnalysis, /If the user (confirmed|approved) with no modifications, skip this step entirely/,
    'prd-analysis: must explicitly skip when no modifications');

  // tech-design: draft snapshot in main SKILL.md (Step 6), capture logic in references/knowledge-capture.md
  assert.match(techDesign, /cat > \.runway\/tmp\/spec-draft-stage2\.md/,
    'tech-design: must save draft snapshot before presenting');
  assert.match(knowledgeCapture, /Present [Ff]indings/,
    'tech-design knowledge-capture: must present findings to user');
  assert.match(knowledgeCapture, /Wait for the user.s response before writing/,
    'tech-design knowledge-capture: must wait for user response before writing');
  assert.match(knowledgeCapture, /跳过，不沉淀/,
    'tech-design knowledge-capture: must offer a skip option');
  assert.match(knowledgeCapture, /Write Confirmed Entries|Write one entry per finding/,
    'tech-design knowledge-capture: must write only after user confirms');
  assert.match(knowledgeCapture, /If the user (confirmed|approved) with no modifications, skip this step entirely/,
    'tech-design knowledge-capture: must explicitly skip when no modifications');
});

test('All knowledge-append calls are non-blocking with || true', () => {
  // CR (Stage 6) and QA (Stage 7) do not capture knowledge — only Stage 1/2/5 do.
  // tech-design knowledge-append lives in references/knowledge-capture.md after refactor.
  const skillFiles = [
    'runway-prd-analysis/SKILL.md',
    'runway-parallel-dev/SKILL.md',
  ];
  const referenceFiles = [
    'runway-tech-design/references/knowledge-capture.md',
  ];

  for (const file of [...skillFiles, ...referenceFiles]) {
    const content = read(file);
    // Extract all knowledge-append call blocks and verify each ends with || true
    const appendCalls = content.match(/knowledge-append[\s\S]*?\|\| true/g) ?? [];
    assert.ok(
      appendCalls.length > 0,
      `${file}: expected at least one knowledge-append call with || true`,
    );
    const allGuarded = !content.includes('knowledge-append') ||
      content.split('knowledge-append').slice(1).every((segment) => {
        const nextPipe = segment.indexOf('|| true');
        const nextAppend = segment.indexOf('knowledge-append');
        return nextPipe !== -1 && (nextAppend === -1 || nextPipe < nextAppend);
      });
    assert.ok(allGuarded, `${file}: every knowledge-append call must be followed by || true`);
  }
});

test('Skill contracts avoid migration-residue wording', () => {
  const skillFiles = [
    'runway/SKILL.md',
    'runway-prd-analysis/SKILL.md',
    'runway-tech-design/SKILL.md',
    'runway-task-planning/SKILL.md',
    'runway-parallel-dev/SKILL.md',
    'runway-code-review-fix/SKILL.md',
    'runway-qa-verify/SKILL.md',
  ];

  const bannedPatterns = [
    /Do not reintroduce standalone/i,
    /Do NOT create standalone/i,
    /\blegacy\b/i,
    /\bno longer\b/i,
    /旧版删掉了什么/,
    /基于旧版本删除了什么/,
    /不要再恢复.*旧章节/,
  ];

  for (const file of skillFiles) {
    const content = read(file);
    for (const pattern of bannedPatterns) {
      assert.doesNotMatch(
        content,
        pattern,
        `${file} should define the current contract directly instead of carrying migration residue: ${pattern}`,
      );
    }
  }
});

test('Stage 5/6 loop init uses loop-init command instead of inline state-init shell block', () => {
  const parallelDev = read('runway-parallel-dev/SKILL.md');
  const codeReview = read('runway-code-review-fix/SKILL.md');

  // Must use the manifest-driven loop-init command with correct stage
  // (args may be on separate lines, so match each key token independently)
  assert.match(parallelDev, /loop-init/);
  assert.match(parallelDev, /--stage 5/);
  assert.match(codeReview, /loop-init/);
  assert.match(codeReview, /--stage 6/);

  // Must NOT contain the old inline cat > ... state-init pattern
  assert.doesNotMatch(parallelDev, /cat > \.runway\/tmp\/pipeline-stage5-prompt\.md/);
  assert.doesNotMatch(codeReview, /cat > \.runway\/tmp\/pipeline-stage6-prompt\.md/);
});

test('Stage 2 loop init uses loop-init command instead of inline state-init shell block', () => {
  const techDesign = read('runway-tech-design/SKILL.md');

  // Must use the manifest-driven loop-init command with correct stage
  assert.match(techDesign, /loop-init/);
  assert.match(techDesign, /--stage 2/);

  // Must NOT contain the old inline cat > ... state-init pattern for triangle loop
  assert.doesNotMatch(techDesign, /cat > \.runway\/tmp\/triangle-loop-prompt\.md/);
});

test('Orchestrator-facing child skills prefer checkpoint-driven auto-run semantics', () => {
  const autotest = read('runway-autotest/SKILL.md');
  const bugAnalysis = read('runway-bug-analysis/SKILL.md');
  const shepherd = read('runway-shepherd/SKILL.md');

  assert.match(autotest, /FIX LOOP \/ F4 复测：若编排器传入 `test_failed_ids`，则\*\*只执行这些失败用例\*\*/);
  assert.match(autotest, /若 `test_failed_ids` 为空数组，视为无需复测/);

  assert.match(bugAnalysis, /`bug_analysis_content_id` 不存在 → 以 `tclist_content_id` 作为 `parentId` 新建分析文档/);
  assert.match(bugAnalysis, /`bug_analysis_content_id` 已存在 → 直接更新该文档/);
  assert.match(bugAnalysis, /编排器调用场景不重复要 MIS/);
  assert.doesNotMatch(bugAnalysis, /写入位置自动推断.*来源报告为 KM 链接时.*contentId.*parentId/s);

  assert.match(shepherd, /runway 编排器调用场景优先规则/);
  assert.match(shepherd, /不要把“是否继续”“是否发布”当作新的人工确认点/);
  assert.match(shepherd, /若主编排器未显式要求自动发布，则本 skill 的成功标准是“创建完成并返回状态”/);
});




