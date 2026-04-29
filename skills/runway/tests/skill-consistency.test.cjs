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

test('Stage 3/5 docs stay aligned with auto-advance semantics', () => {
  const orchestrator = read('runway/SKILL.md');
  const planning = read('runway-task-planning/SKILL.md');
  const parallelDev = read('runway-parallel-dev/SKILL.md');

  assert.match(orchestrator, /Stage 3 → 4 → 5 → 6 → 7 auto-advance unless blocked\./);
  assert.match(planning, /auto-advance into Stage 4 branch creation/);
  assert.doesNotMatch(parallelDev, /confirmed plan/i);
});

test('Stage 1-3 artifacts stay split between spec, design review, and execution plan', () => {
  const orchestrator = read('runway/SKILL.md');
  const techDesign = read('runway-tech-design/SKILL.md');
  const techTemplate = read('runway-tech-design/references/tech-spec-template.md');
  const planning = read('runway-task-planning/SKILL.md');
  const readme = read('README.md');

  assert.match(orchestrator, /Stage 1: runway-prd-analysis\s+→ requirements spec \(spec\) uploaded to xuecheng/);
  assert.match(orchestrator, /Stage 2: runway-tech-design\s+→ review-friendly tech spec uploaded to xuecheng/);
  assert.match(orchestrator, /Stage 3: runway-task-planning\s+→ executable plan\/tasks saved locally/);
  assert.match(readme, /4\. Design the technical solution/);
  assert.match(readme, /5\. \*\*\[Pause\]\*\* Wait for your review and approval/);
  assert.match(readme, /6\. Upload the approved technical solution to xuecheng/);
  assert.match(readme, /7\. Hand off to ee-ones for feature branch creation/);
  assert.match(readme, /8\. Execute development in parallel waves with TDD enforcement/);

  assert.match(techDesign, /Stage 2 produces a review-friendly tech spec, not an executable implementation plan\./);
  assert.match(techDesign, /Keep outward-facing interface\/API contract changes in this document, but leave internal parameter details, concrete class names, file paths, field numbers, test code, Wave splitting, and TDD task steps to runway-task-planning\./);
  assert.match(techDesign, /\*\*二、详细设计\*\* — 只写实现方案、业务逻辑、关键流程、状态变化、模块边界/);
  assert.match(techDesign, /\*\*三、接口协议变更\*\* — 只写对外请求\/响应或契约变化、兼容性说明；若只是模块内参数、内部 RPC、内部事件、内部数据结构调整，不写在这里/);
  assert.match(techDesign, /\*\*七、架构ADR\*\* — 仅在 ADR 触发时提供紧凑决策表，直观写出方案对比、选型依据、决策理由/);
  assert.doesNotMatch(techDesign, /\*\*方案摘要\*\* —/);
  assert.doesNotMatch(techDesign, /\*\*设计原则（Principles）\*\*/);
  assert.doesNotMatch(techDesign, /\*\*四、发布与风险控制\*\*/);
  assert.doesNotMatch(techDesign, /\*\*每个模块\*\* — .*接口契约（Interfaces）/);
  assert.doesNotMatch(techDesign, /\*\*七、任务规划交接说明\*\*/);
  assert.doesNotMatch(techDesign, /Do not reintroduce standalone `方案摘要`, `设计原则`, or `发布与风险控制` chapters\./);
  assert.doesNotMatch(techDesign, /Do NOT create standalone `方案摘要`, `设计原则`, or `发布与风险控制` chapters\./);
  assert.match(techTemplate, /## 三、接口协议变更/);
  assert.match(techTemplate, /## 七、架构ADR/);
  assert.match(techTemplate, /\| 方案对比 \| 选型依据 \| 决策理由 \|/);
  assert.doesNotMatch(techTemplate, /\*\*接口设计（Interfaces）：\*\*/);
  assert.doesNotMatch(techTemplate, /## 七、任务规划交接说明/);
  assert.doesNotMatch(techTemplate, /第七节任务规划交接说明/);

  assert.match(planning, /Extract: design constraints, interface contracts, module boundaries, rollout\/risk constraints, and open decisions that affect implementation sequencing\./);
  assert.match(planning, /Do not treat the tech spec as file-level implementation truth\./);
  assert.match(planning, /If an ADR is provided, read it for decision rationale and non-negotiable constraints\./);
});

test('Stage 3 explicitly maps Stage 2 formal sections without adding a new Stage 2 handoff chapter', () => {
  const planning = read('runway-task-planning/SKILL.md');
  const planTemplate = read('runway-task-planning/references/plan-template.md');
  const planChecklist = read('runway-task-planning/references/plan-review-checklist.md');
  const handoff = read('runway/references/stage-handoff.md');

  assert.match(planning, /`二、详细设计` → 每个模块至少映射到一个任务或显式写明无需单独任务的原因/);
  assert.match(planning, /`三、接口协议变更` → 每个接口 \/ API \/ 事件 \/ 数据契约变化至少映射到一个任务/);
  assert.match(planning, /`四、基础设施设计` → 每个“涉及”的配置 \/ 存储 \/ 消息 \/ 定时任务 \/ 外部依赖项，必须归类为任务、前置条件，或显式写“不需要任务 — 原因”/);
  assert.match(planning, /`五、验证策略` → 每个关键风险必须映射到任务内测试步骤或 Wave integration verification/);
  assert.match(planning, /`六、待决策项` → 每项必须归类为：已解决 \/ Wave 0 前置 \/ blocker \/ 风险接受/);

  assert.match(planTemplate, /## 设计项 → 计划项映射/);
  assert.match(planTemplate, /\| 来源章节 \| 设计项 \| 对应任务 \/ Wave \/ blocker \| 处理状态 \|/);

  assert.match(planChecklist, /`二、详细设计` 的每个模块均已被任务覆盖或写明原因/);
  assert.match(planChecklist, /`三、接口协议变更` 的每个契约变化均已落到任务/);
  assert.match(planChecklist, /`四、基础设施设计` 的每个涉及项均已处置/);
  assert.match(planChecklist, /`五、验证策略` 的关键风险均映射到测试 \/ 集成验证/);
  assert.match(planChecklist, /`六、待决策项` 的每项均已有处置分类/);
  assert.match(planChecklist, /不允许只在 prose 中“提到会处理”，但没有对应任务 \/ Wave \/ blocker/);

  assert.match(handoff, /\| `二、详细设计` \| tech spec \| module-to-task mapping /);
  assert.match(handoff, /\| `三、接口协议变更` \| tech spec \| contract-first task decomposition /);
  assert.match(handoff, /\| `四、基础设施设计` \| tech spec \| infra tasks, prerequisites, and explicit non-task reasons /);
  assert.match(handoff, /\| `五、验证策略` \| tech spec \| task-level tests and wave integration verification /);
  assert.match(handoff, /\| `六、待决策项` \| tech spec \| resolved items, Wave 0 prerequisites, blockers, or accepted risks /);
  assert.doesNotMatch(handoff, /runway-task-planning handoff notes/);
});

test('Tech design keeps ADR optional and enforces a readability gate', () => {
  const techDesign = read('runway-tech-design/SKILL.md');
  const techTemplate = read('runway-tech-design/references/tech-spec-template.md');

  assert.match(techDesign, /ADR is optional\. Generate a separate ADR only when the decision itself needs long-term traceability\./);
  assert.match(techDesign, /Readability check — can a reviewer read this in 10 minutes and decide\?/);
  assert.match(techTemplate, /这是给人 review 的技术方案，不是执行计划。/);
  assert.match(techTemplate, /不要写代码、字段编号、文件路径、Wave \/ TDD 步骤。/);
  assert.match(techTemplate, /## 七、架构ADR/);
  assert.doesNotMatch(techTemplate, /## 方案摘要/);
  assert.doesNotMatch(techTemplate, /### 设计原则（Principles）/);
  assert.doesNotMatch(techTemplate, /## 四、发布与风险控制/);
});

test('Non-triggered ADR stays in normal sections and never appears as ADR-labeled output', () => {
  const techDesign = read('runway-tech-design/SKILL.md');
  const techTemplate = read('runway-tech-design/references/tech-spec-template.md');

  assert.match(techDesign, /If none apply, keep the rationale in the tech spec only and do not force an ADR artifact\./);
  assert.match(techDesign, /When ADR is not triggered, keep any decision rationale inside the relevant required sections and do not label it as ADR\./);
  assert.match(techDesign, /When ADR is not triggered, do not emit `七、架构ADR`, `ADR`, or the table headers `方案对比 \| 选型依据 \| 决策理由` anywhere in the output\./);
  assert.match(techTemplate, /未触发 ADR 时：可在相关必填章节保留普通决策理由，但不要出现 `ADR` 标签、`七、架构ADR` 节名或 ADR 决策表样式。/);
});

test('Stage 2 progress displays are non-blocking until the real Hard Gate', () => {
  const techDesign = read('runway-tech-design/SKILL.md');

  assert.match(techDesign, /中途展示 Planner \/ Architect \/ Critic 结果时，仅用于透明同步，不是确认点，也不是新的 Hard Gate/);
  assert.match(techDesign, /展示后必须在同一轮继续执行下一步；除非已经到达 Step 6 Hard Gate 或遇到真正 blocker，否则不得停下来等待用户回复/);
  assert.match(techDesign, /Planner 草稿完成（第 N 轮）[\s\S]*?这是进度同步，不是暂停点。输出后不得停下等待用户确认；必须在同一轮继续进入下一个必需步骤/);
  assert.match(techDesign, /After each Architect pass, display findings to the user immediately, then continue in the same turn unless Step 6 Hard Gate or a true blocker has been reached:/);
  assert.match(techDesign, /After each Critic pass, display verdict and findings to the user immediately, then continue in the same turn unless Step 6 Hard Gate or a true blocker has been reached:/);
  assert.match(techDesign, /## Step 6: User Review \(HARD GATE\)/);
  assert.match(techDesign, /Loop lifecycle:[\s\S]*?Deactivate it only \*\*after\*\* explicit Hard Gate approval and successful xuecheng upload\./);
});

test('Stage 2 only allows Hard Gate or real blockers to pause execution', () => {
  const techDesign = read('runway-tech-design/SKILL.md');

  assert.match(techDesign, /Only Step 6 \(User Review\) is a user pause point\. Steps 1-5 and Step 7 must continue in the same turn unless a true blocker is hit\./);
  assert.match(techDesign, /After Step 1 and Step 2 complete, continue directly into the admitted review path in the same turn\. Do not stop after scan results, admission choice, or exploration notes\./);
  assert.match(techDesign, /When using subagents, await each required result and continue in the same turn\. Do not stop after dispatching Planner, Architect, or Critic\./);
  assert.match(techDesign, /If a targeted Planner revision is required, treat it as an internal repair step, then continue immediately to the required next pass in the same turn\./);
  assert.match(techDesign, /Step 4 \(deliberate mode\) and Step 5 \(self-review\) are internal quality steps, not review pauses or confirmation points\./);
  assert.match(techDesign, /If unresolved issues remain after the allowed review cycles, include them in the Step 6 Hard Gate presentation instead of creating a separate pre-Hard-Gate stop\./);
  assert.match(techDesign, /Do not ask the user whether to continue before Step 6\. Do not wait for "继续" or similar confirmation before the Hard Gate\./);
});

test('Stage 2 defaults to lightweight admission and narrows heavy review and ADR triggers', () => {
  const techDesign = read('runway-tech-design/SKILL.md');
  const orchestrator = read('runway/SKILL.md');
  const readme = read('README.md');
  const troubleshooting = read('runway/references/troubleshooting.md');

  assert.match(techDesign, /3-level admission model/);
  assert.match(techDesign, /Level 0 \(default\).*Planner only/s);
  assert.match(techDesign, /Level 1.*Planner → Architect/s);
  assert.match(techDesign, /Level 2.*Planner → Architect → Critic/s);
  assert.match(techDesign, /at most one revision cycle/i);
  assert.match(techDesign, /2 total cycles/);
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
  const techTemplate = read('runway-tech-design/references/tech-spec-template.md');

  assert.match(techDesign, /Keep outward-facing interface\/API contract changes in this document, but leave internal parameter details, concrete class names, file paths, field numbers, test code, Wave splitting, and TDD task steps to runway-task-planning\./);
  assert.match(techDesign, /按对外接口 \/ API 逐项列出，明确写出改的是哪个接口/);
  assert.match(techDesign, /request\/input 与 response\/output 分开写/);
  assert.match(techDesign, /每个新增 \/ 修改 \/ 删除字段至少写清：字段名、数据类型、字段含义/);
  assert.match(techDesign, /不要用大段文字笼统概括接口变更/);
  assert.match(techDesign, /若只是模块内参数、内部 RPC、内部事件、内部数据结构调整，不写在这里/);
  assert.match(techDesign, /若存在接口协议变更，每个新增\/修改\/删除字段已写清字段名、数据类型、字段含义；request\/input 与 response\/output 已分开列出/);

  assert.match(techTemplate, /本层回答：\*\*对外接口 \/ API 契约怎么变。\*\*/);
  assert.match(techTemplate, /不要写内部 RPC、内部事件、模块内参数细节/);
  assert.match(techTemplate, /#### Request \/ Input 字段变更/);
  assert.match(techTemplate, /#### Response \/ Output 字段变更/);
  assert.match(techTemplate, /\| 字段名 \| 类型 \| 变更 \| 含义 \|/);
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
  assert.match(parallelDev, /state-update --root "\$PWD" --name pipeline\.local\.md --active false/);
  assert.match(codeReview, /state-update --root "\$PWD" --name pipeline\.local\.md --active false/);
  assert.match(techDesign, /state-update --root "\$PWD" --name triangle-loop\.local\.md --active false/);
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

  assert.match(stopHook, /# runway: Stop hook — keeps the Stage 4-7 pipeline loop running/);
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
  assert.match(troubleshooting, /Only the Stage 4-7 pipeline loop should trigger Stop-hook exit protection/);
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
  assert.match(prdAnalysis, /knowledge-read --root "\$PWD" --inject-into-stage 1/);
  assert.match(techDesign, /knowledge-read --root "\$PWD" --inject-into-stage 2/);
  assert.match(taskPlanning, /knowledge-read --root "\$PWD" --inject-into-stage 3/);
  assert.match(parallelDev, /knowledge-read --root "\$PWD" --inject-into-stage 5/);

  // Stage 5 implementer prompt must have a Known Project Pitfalls field
  const implementerPrompt = read('runway-parallel-dev/references/implementer-prompt.md');
  assert.match(implementerPrompt, /## Known Project Pitfalls/);
  assert.match(implementerPrompt, /KNOWLEDGE_S5/);
});

test('Hard Gate knowledge capture follows the extract-present-confirm-write sequence', () => {
  const prdAnalysis = read('runway-prd-analysis/SKILL.md');
  const techDesign = read('runway-tech-design/SKILL.md');

  for (const [name, content] of [['prd-analysis', prdAnalysis], ['tech-design', techDesign]]) {
    // Step 1: draft snapshot must be saved before presenting to user
    assert.match(content, /cat > \.runway\/tmp\/spec-draft-stage\d\.md/,
      `${name}: must save draft snapshot before presenting`);

    // Step 2: AI must present findings to user before writing
    assert.match(content, /Present findings to the user for confirmation/,
      `${name}: must present findings to user`);

    // Step 3: must wait for user response before writing
    assert.match(content, /Wait for the user.s response before writing anything/,
      `${name}: must wait for user response before writing`);

    // Step 4: user confirmation options must include a skip option
    assert.match(content, /跳过，不沉淀/,
      `${name}: must offer a skip option`);

    // Step 5: write only after user confirms
    assert.match(content, /After the user confirms.*write each approved entry/s,
      `${name}: must write only after user confirms`);

    // Skip condition must be explicit
    assert.match(content, /If the user (confirmed|approved) with no modifications, skip this step entirely/,
      `${name}: must explicitly skip when no modifications`);
  }
});

test('All knowledge-append calls are non-blocking with || true', () => {
  // CR (Stage 6) and QA (Stage 7) do not capture knowledge — only Stage 1/2/5 do.
  const skillFiles = [
    'runway-prd-analysis/SKILL.md',
    'runway-tech-design/SKILL.md',
    'runway-parallel-dev/SKILL.md',
  ];

  for (const file of skillFiles) {
    const content = read(file);
    // Extract all knowledge-append call blocks and verify each ends with || true
    const appendCalls = content.match(/knowledge-append[\s\S]*?\|\| true/g) ?? [];
    assert.ok(
      appendCalls.length > 0,
      `${file}: expected at least one knowledge-append call with || true`,
    );
    // No knowledge-append call should appear without || true
    const bareAppend = content.match(/knowledge-append(?![\s\S]*?\|\| true[\s\S]*?knowledge-append)/g);
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




