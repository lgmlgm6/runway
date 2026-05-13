# HTTP 请求执行规范

## 执行工具

二阶段统一使用 `curl`，认证信息从测试数据文档中读取。

---

## 认证信息格式

测试数据文档中认证信息支持两种格式，二选一：

```
Cookie: xxx=yyy; zzz=www
```

或：

```
Authorization: Bearer xxxxx
```

执行时作为 `-H` 参数传入每个请求。

---

## 标准执行模板

所有请求统一加 `-i` 输出响应 header，用于提取 `M-TraceId`。
断言统一用 Python 完成，**禁止用 shell 字符串比较**。

```bash
# POST 请求（含认证 Cookie）
RESPONSE=$(curl -si -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: xxx=yyy" \
  -d '{"key":"value"}' \
  "https://host/path" 2>&1)

# 分离 header 和 body，提取 TraceId 和断言
python3 - "$RESPONSE" << 'PYEOF'
import sys, json

raw = sys.argv[1]
# 分离 header 和 body（空行分隔）
parts = raw.split('\r\n\r\n', 1)
if len(parts) < 2:
    parts = raw.split('\n\n', 1)
header_part = parts[0] if len(parts) > 0 else ''
body_part = parts[1] if len(parts) > 1 else ''

# 提取 TraceId
trace_id = ''
for line in header_part.splitlines():
    if line.lower().startswith('m-traceid:'):
        trace_id = line.split(':', 1)[1].strip()
        break

# 解析 body
d = json.loads(body_part)
code = d.get('code')
assert code == 0, f'FAIL: 预期 code=0，实际 code={code}, msg={d.get("msg")}'
print(f'PASS: code=0, traceId={trace_id}')
PYEOF
```

---

## 提取步骤间变量

E2E 用例中，从上一步响应提取字段注入下一步：

```bash
# Step1：加入精选，提取 createTime
RESPONSE=$(curl -si -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: xxx=yyy" \
  -d '{"postId":"123"}' \
  "https://host/add" 2>&1)

STEP1_CREATE_TIME=$(python3 - "$RESPONSE" << 'PYEOF'
import sys, json
raw = sys.argv[1]
parts = raw.split('\r\n\r\n', 1)
if len(parts) < 2:
    parts = raw.split('\n\n', 1)
body = parts[1] if len(parts) > 1 else raw
d = json.loads(body)
assert d['code'] == 0, f'FAIL: code={d["code"]}, msg={d.get("msg")}'
print(d['data']['createTime'])
PYEOF
)

# Step2：列表验证，断言 createTime 与 Step1 一致
RESPONSE=$(curl -si -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: xxx=yyy" \
  -d '{"categoryId":180901,"pageNum":1,"pageSize":20}' \
  "https://host/list" 2>&1)

python3 - "$RESPONSE" "$STEP1_CREATE_TIME" << 'PYEOF'
import sys, json
raw = sys.argv[1]
expected_ct = sys.argv[2]
parts = raw.split('\r\n\r\n', 1)
if len(parts) < 2:
    parts = raw.split('\n\n', 1)
header_part = parts[0] if len(parts) > 0 else ''
body = parts[1] if len(parts) > 1 else raw

trace_id = ''
for line in header_part.splitlines():
    if line.lower().startswith('m-traceid:'):
        trace_id = line.split(':', 1)[1].strip()
        break

d = json.loads(body)
assert d['code'] == 0, f'FAIL: code={d["code"]}'
first = d['data']['list'][0]
assert first['createTime'] == expected_ct, f'FAIL: createTime 不一致，列表={first["createTime"]}，Step1={expected_ct}'
print(f'PASS: createTime 一致={first["createTime"]}, traceId={trace_id}')
PYEOF
```

---

## 断言规则速查

| 断言 | Python 写法 |
|-----|------------|
| code == 0 | `assert d['code'] == 0` |
| code != 0 | `assert d['code'] != 0` |
| 字段存在且非空 | `assert d['data']['field']` |
| 列表非空 | `assert len(d['data']['list']) > 0` |
| 字段等于预期值 | `assert d['data']['field'] == expected` |
| msg 非空 | `assert d.get('msg')` |

---

## 常见问题

| 问题 | 原因 | 处理 |
|-----|------|------|
| body 解析失败 | header/body 分隔符不一致（\r\n\r\n vs \n\n） | 两种都尝试，见模板中的 `split` 逻辑 |
| TraceId 为空 | 服务未返回 `M-TraceId` header | 填 `—`，不影响断言 |
| `connection refused` | 服务未启动或地址错误 | 标记为 Error，不计 Fail |
| 响应非 JSON | 接口返回 HTML 或纯文本 | 截取前 200 字符展示，标记为 Error |
| 认证失败（401/403 或 code=50102） | Cookie/Token 过期或格式错误 | 提示用户更新测试数据文档中的认证信息 |
