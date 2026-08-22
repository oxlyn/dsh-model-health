// dsh-model-health — client 模块：在设置页注入"模型列表"section。
//
// 格式：window.__ModuleLoader__.load({ id, factory: (require) => {...} })
// 这是 DSH 浏览器侧的模块加载器格式，factory 内用 require() 获取依赖。
//
// 注册一个 settings.section slot，组件通过 fetch /api/model-health/json 获取
// 模型列表 JSON，然后用 React 直接渲染表格。
// 支持"测试全部"：并发 POST /api/model-health/test，逐个更新测试状态。
//
window.__ModuleLoader__.load({
    id: "dsh-model-health",
    factory: (require) => {
        var module = { exports: {} };
        var exports = module.exports;

        const React = require("react");
        const { useState, useEffect, useCallback } = React;

        // 内联样式（适配 DSH 明暗主题的 CSS 变量）
        const STYLES = {
            wrap: {
                maxWidth: 1100,
                color: "var(--dsw-alias-label-primary, #333)",
                display: "flex",
                flexDirection: "column",
                gap: 12,
            },
            head: {
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                flexWrap: "wrap",
            },
            title: {
                margin: 0,
                fontSize: 16,
                fontWeight: 500,
                lineHeight: "24px",
            },
            count: {
                display: "inline-block",
                background: "var(--dsw-alias-button-primary-fill, #4f46e5)",
                color: "var(--dsw-alias-label-primary-foreground, #fff)",
                padding: "2px 10px",
                borderRadius: 12,
                fontSize: 12,
            },
            toolbar: {
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
            },
            meta: {
                color: "var(--dsw-alias-label-tertiary, #888)",
                fontSize: 13,
                marginRight: "auto",
            },
            btn: {
                boxSizing: "border-box",
                height: 28,
                padding: "0 14px",
                fontSize: 12,
                lineHeight: "18px",
                cursor: "pointer",
                border: "1px solid var(--dsw-alias-border-l2, #ddd)",
                borderRadius: 14,
                background: "transparent",
                color: "var(--dsw-alias-label-primary, #333)",
            },
            btnPrimary: {
                background: "var(--dsw-alias-button-primary-fill, #4f46e5)",
                color: "var(--dsw-alias-label-primary-foreground, #fff)",
                border: "none",
            },
            btnDisabled: {
                opacity: 0.5,
                cursor: "not-allowed",
            },
            progress: {
                fontSize: 12,
                color: "var(--dsw-alias-label-tertiary, #888)",
            },
            tableWrap: {
                // 圆角/阴影放在外层容器：<table> 上的 overflow/border-radius 不生效，
                // 且 collapse 模式下圆角无法裁剪单元格背景
                background: "var(--dsw-alias-bg-layer-2, #fafafa)",
                borderRadius: 8,
                overflow: "hidden",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            },
            table: {
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
            },
            th: {
                padding: "10px 12px",
                textAlign: "left",
                // 四边全边框：collapse 模式下相邻边自动合并，
                // 整张表（含外框）呈现统一闭合的网格线
                border: "1px solid var(--dsw-alias-border-l2, #eee)",
                background: "var(--dsw-alias-bg-module-platform, #fff)",
                fontWeight: 600,
                whiteSpace: "nowrap",
            },
            td: {
                padding: "10px 12px",
                textAlign: "left",
                border: "1px solid var(--dsw-alias-border-l2, #eee)",
                color: "var(--dsw-alias-label-primary, #333)",
            },
            code: {
                background: "var(--dsw-alias-bg-layer-2, #f0f0f0)",
                padding: "2px 6px",
                borderRadius: 3,
                fontSize: 12,
                fontFamily: "var(--ds-font-family-code, monospace)",
            },
            badge: {
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 500,
                whiteSpace: "nowrap",
            },
            badgeOk: {
                background: "var(--dsw-alias-state-success-bg, #e6f4ea)",
                color: "var(--dsw-alias-state-success-primary, #1e8e3e)",
            },
            badgeFail: {
                background: "var(--dsw-alias-state-error-bg, #fce8e6)",
                color: "var(--dsw-alias-state-error-primary, #d32f2f)",
            },
            badgeTesting: {
                background: "var(--dsw-alias-state-info-bg, #e8f0fe)",
                color: "var(--dsw-alias-state-info-primary, #1967d2)",
            },
            badgeSkip: {
                background: "var(--dsw-alias-bg-layer-2, #f0f0f0)",
                color: "var(--dsw-alias-label-tertiary, #888)",
            },
            badgeIdle: {
                background: "var(--dsw-alias-bg-layer-2, #f0f0f0)",
                color: "var(--dsw-alias-label-tertiary, #999)",
            },
            center: {
                textAlign: "center",
                color: "var(--dsw-alias-label-tertiary, #999)",
                padding: "40px 0",
            },
            error: {
                color: "var(--dsw-alias-state-error-primary, #d32f2f)",
                padding: "16px",
            },
            loading: {
                color: "var(--dsw-alias-label-tertiary, #999)",
                padding: "24px 0",
                textAlign: "center",
            },
            errorMsg: {
                color: "var(--dsw-alias-state-error-primary, #d32f2f)",
                fontSize: 12,
                maxWidth: 200,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
            },
            colToggleLabel: {
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                cursor: "pointer",
                color: "var(--dsw-alias-label-secondary, #555)",
                userSelect: "none",
            },
            colToggleCheckbox: {
                cursor: "pointer",
            },
        };

        // 列定义：optional=true 的列默认不显示，由多选框控制
        const COLUMNS = [
            { key: "provider", label: "Provider" },
            { key: "modelId", label: "模型 ID", code: true, optional: true },
            { key: "modelName", label: "名称" },
            { key: "contextWindow", label: "上下文窗口", optional: true },
            { key: "maxTokens", label: "最大输出", optional: true },
            { key: "input", label: "输入模态", optional: true },
            { key: "api", label: "API 协议", optional: true },
            { key: "baseURL", label: "BaseURL", code: true, optional: true },
            { key: "_status", label: "状态" },
            { key: "_latency", label: "延迟" },
        ];

        // 状态标签映射
        const STATUS_LABEL = {
            idle: "未测试",
            testing: "测试中",
            ok: "可用",
            fail: "不可用",
            skip: "跳过",
        };
        const STATUS_STYLE = {
            idle: STYLES.badgeIdle,
            testing: STYLES.badgeTesting,
            ok: STYLES.badgeOk,
            fail: STYLES.badgeFail,
            skip: STYLES.badgeSkip,
        };

        /**
         * 模型列表 section 组件。
         * fetch /api/model-health/json 获取数据 → React 渲染表格。
         * "测试全部" → 并发 POST /api/model-health/test，逐个更新状态。
         */
        // localStorage 持久化测试结果的 key
        const STORAGE_KEY = "dsh-model-health:test-results";

        function loadStoredResults() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                const parsed = raw ? JSON.parse(raw) : {};
                const cleaned = {};
                // 清理：残留的 testing（测试中刷新页面）归一为 idle；
                // 旧版按数组下标存的纯数字 key 直接丢弃
                for (const k in parsed) {
                    if (/^\d+$/.test(k)) continue;
                    const v = parsed[k];
                    if (!v || typeof v !== "object") continue;
                    cleaned[k] = v.status === "testing" ? { status: "idle" } : v;
                }
                return cleaned;
            } catch (e) {
                return {};
            }
        }

        function saveStoredResults(results) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
            } catch (e) {
                // ignore quota errors
            }
        }

        function ModelListSection() {
            const [state, setState] = useState({
                loading: true,
                error: null,
                data: null,
            });
            // testResults: { [modelKey]: { status, latency?, error? } }
            // key 为 provider/modelId（与 host 侧一致），settings 增删/排序不错位；
            // 初始值从 localStorage 读取，实现跨刷新持久化
            const [testResults, setTestResults] = useState(loadStoredResults);
            const [testing, setTesting] = useState(false);
            const [progress, setProgress] = useState({ done: 0, total: 0 });
            // 可选列显示状态：{ [colKey]: boolean }，默认 false
            const [optionalCols, setOptionalCols] = useState({});
            // hover tooltip 状态：{ index, error } | null
            const [tooltip, setTooltip] = useState(null);

            const loadData = useCallback(async () => {
                setState((s) => ({ ...s, loading: true, error: null }));
                try {
                    const resp = await fetch("/api/model-health/json", { cache: "no-store" });
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    const json = await resp.json();
                    if (!json.ok) throw new Error(json.error || "未知错误");
                    setState({ loading: false, error: null, data: json });
                    // 不清空 testResults，保留上次测试结果
                } catch (e) {
                    setState({ loading: false, error: e.message, data: null });
                }
            }, []);

            useEffect(() => {
                loadData();
            }, [loadData]);

            // 测试全部：并发发起所有测试请求，每个完成即更新对应行状态
            const testAll = useCallback(async () => {
                const data = state.data;
                if (!data || !data.models || data.models.length === 0) return;
                const total = data.models.length;
                setTesting(true);
                setProgress({ done: 0, total });
                // 初始化所有为 testing（按 provider/modelId key）
                const init = {};
                for (const m of data.models) init[m.key] = { status: "testing" };
                setTestResults(init);
                saveStoredResults(init);

                let done = 0;
                // 并发测试，但限制并发数避免压垮 host/网络
                const CONCURRENCY = 6;
                const queue = data.models.map((m) => m.key);

                // 更新单个结果并同步到 localStorage
                function updateResult(key, result) {
                    setTestResults((s) => {
                        const next = { ...s, [key]: result };
                        saveStoredResults(next);
                        return next;
                    });
                }

                async function runOne(key) {
                    try {
                        const resp = await fetch("/api/model-health/test", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ key }),
                            cache: "no-store",
                        });
                        const json = await resp.json();
                        if (!json.ok) {
                            updateResult(key, { status: "fail", error: json.error });
                        } else {
                            updateResult(key, {
                                status: json.status || "fail",
                                latency: json.latency,
                                error: json.error,
                            });
                        }
                    } catch (e) {
                        updateResult(key, { status: "fail", error: e.message });
                    } finally {
                        done++;
                        setProgress({ done, total });
                        if (done >= total) setTesting(false);
                    }
                }

                // 限制并发的 worker pool
                async function worker() {
                    while (queue.length > 0) {
                        const key = queue.shift();
                        if (key === undefined) break;
                        await runOne(key);
                    }
                }
                const workers = Array.from(
                    { length: Math.min(CONCURRENCY, total) },
                    () => worker()
                );
                await Promise.all(workers);
            }, [state.data]);

            const h = React.createElement;

            if (state.loading) {
                return h("div", { style: STYLES.wrap },
                    h("div", { style: STYLES.loading }, "加载中...")
                );
            }

            if (state.error) {
                return h("div", { style: STYLES.wrap },
                    h("div", { style: STYLES.error },
                        "读取模型列表失败：", state.error
                    ),
                    h("button", {
                        style: STYLES.btn,
                        onClick: loadData,
                    }, "重试")
                );
            }

            const data = state.data || { models: [], count: 0, source: "", updatedAt: "" };
            const models = data.models || [];
            const updatedAt = new Date(data.updatedAt || Date.now()).toLocaleString("zh-CN");

            // 统计测试结果
            const stats = { ok: 0, fail: 0, skip: 0, testing: 0 };
            for (const k in testResults) {
                const s = testResults[k].status;
                if (s === "ok") stats.ok++;
                else if (s === "fail") stats.fail++;
                else if (s === "skip") stats.skip++;
                else if (s === "testing") stats.testing++;
            }

            // 可见列：非可选列始终显示；可选列根据 optionalCols 状态
            const visibleCols = COLUMNS.filter(
                (col) => !col.optional || optionalCols[col.key]
            );
            const optionalColumns = COLUMNS.filter((col) => col.optional);

            const toggleCol = (key) => {
                setOptionalCols((s) => ({ ...s, [key]: !s[key] }));
            };

            return h("div", { style: STYLES.wrap },
                h("div", { style: STYLES.head },
                    h("h2", { style: STYLES.title }, "已配置模型"),
                    h("span", { style: STYLES.count }, data.count || models.length)
                ),
                h("div", { style: STYLES.toolbar },
                    h("span", { style: STYLES.meta },
                        "更新时间：", updatedAt
                    ),
                    // 测试统计
                    (stats.ok + stats.fail + stats.skip > 0) && h("span", { style: STYLES.progress },
                        `✓ ${stats.ok}  ✗ ${stats.fail}`,
                        stats.skip > 0 ? `  ⊘ ${stats.skip}` : ""
                    ),
                    testing && h("span", { style: STYLES.progress },
                        `${progress.done}/${progress.total}`
                    ),
                    // 测试全部按钮
                    h("button", {
                        style: {
                            ...STYLES.btn,
                            ...STYLES.btnPrimary,
                            ...(testing ? STYLES.btnDisabled : {}),
                        },
                        disabled: testing || models.length === 0,
                        onClick: testAll,
                    }, testing ? "测试中..." : "测试全部")
                ),
                // 可选列 toggle 按钮组
                h("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
                    h("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary, #888)" } },
                        "显示列："
                    ),
                    optionalColumns.map((col) => {
                        const active = !!optionalCols[col.key];
                        return h("button", {
                            key: col.key,
                            onClick: () => toggleCol(col.key),
                            style: {
                                boxSizing: "border-box",
                                height: 24,
                                padding: "0 10px",
                                fontSize: 12,
                                cursor: "pointer",
                                border: active
                                    ? "1px solid var(--dsw-alias-button-primary-fill, #4f46e5)"
                                    : "1px solid var(--dsw-alias-border-l2, #ddd)",
                                borderRadius: 12,
                                background: active
                                    ? "var(--dsw-alias-button-primary-fill, #4f46e5)"
                                    : "transparent",
                                color: active
                                    ? "var(--dsw-alias-label-primary-foreground, #fff)"
                                    : "var(--dsw-alias-label-secondary, #555)",
                            },
                        }, col.label);
                    })
                ),
                models.length === 0
                    ? h("div", { style: STYLES.center },
                        "未配置任何模型，请在 设置 → 模型 中添加。"
                    )
                    : h("div", { style: STYLES.tableWrap },
                        h("table", { style: STYLES.table },
                        h("thead", null,
                            h("tr", null,
                                visibleCols.map((col) =>
                                    h("th", {
                                        key: col.key,
                                        style: STYLES.th,
                                    }, col.label)
                                )
                            )
                        ),
                        h("tbody", null,
                            // 预计算 provider 连续段的 rowspan：{ [startIdx]: spanLen }
                            // 相同 provider 的连续行合并为一个单元格
                            (() => {
                                const providerSpan = {};
                                let k = 0;
                                while (k < models.length) {
                                    const start = k;
                                    const p = models[k].provider;
                                    while (k < models.length && models[k].provider === p) k++;
                                    providerSpan[start] = k - start;
                                }
                                return models.map((row, i) => {
                                    const tr = testResults[row.key] || { status: "idle" };
                                    const statusLabel = STATUS_LABEL[tr.status] || tr.status;
                                    const statusStyle = STATUS_STYLE[tr.status] || STYLES.badgeIdle;
                                    const latencyText = tr.latency != null ? `${tr.latency}ms` : "-";
                                    return h("tr", { key: (row.modelId || "") + i },
                                        visibleCols.map((col) => {
                                            if (col.key === "provider") {
                                                const span = providerSpan[i];
                                                if (span === undefined) return null; // 被合并，跳过
                                                return h("td", {
                                                    key: col.key,
                                                    rowSpan: span,
                                                    style: { ...STYLES.td, verticalAlign: "middle", fontWeight: 600 },
                                                }, row.provider);
                                            }
                                            if (col.key === "_status") {
                                                const hasError = tr.error && tr.status === "fail";
                                                return h("td", {
                                                    key: col.key,
                                                    style: { ...STYLES.td },
                                                },
                                                    h("span", {
                                                        style: {
                                                            ...STYLES.badge,
                                                            ...statusStyle,
                                                            cursor: hasError ? "help" : "default",
                                                        },
                                                        onMouseEnter: hasError
                                                            ? (e) => {
                                                                const rowEl = e.currentTarget.closest('tr');
                                                                const tableEl = e.currentTarget.closest('table');
                                                                if (rowEl && tableEl) {
                                                                    const rowRect = rowEl.getBoundingClientRect();
                                                                    const tableRect = tableEl.getBoundingClientRect();
                                                                    setTooltip({
                                                                        index: i,
                                                                        error: tr.error,
                                                                        left: tableRect.left,
                                                                        width: tableRect.width,
                                                                        rowTop: rowRect.top,
                                                                    });
                                                                }
                                                            }
                                                            : undefined,
                                                        onMouseLeave: hasError
                                                            ? () => setTooltip(null)
                                                            : undefined,
                                                    }, statusLabel)
                                                );
                                            }
                                            if (col.key === "_latency") {
                                                return h("td", { key: col.key, style: STYLES.td }, latencyText);
                                            }
                                            const value = row[col.key] ?? "-";
                                            return h("td", {
                                                key: col.key,
                                                style: STYLES.td,
                                            },
                                                col.code
                                                    ? h("code", { style: STYLES.code }, String(value))
                                                    : String(value)
                                            );
                                        })
                                    );
                                });
                            })()
                        )
                        )
                    ),
                // 全宽 hover tooltip：横向占满表格，显示在所悬停行的正上方
                tooltip ? h("div", {
                    style: {
                        position: "fixed",
                        left: tooltip.left + "px",
                        width: tooltip.width + "px",
                        top: tooltip.rowTop + "px",
                        transform: "translateY(-100%)",
                        marginTop: -4,
                        padding: "8px 12px",
                        background: "var(--dsw-alias-state-error-bg, #2a2a2a)",
                        color: "var(--dsw-alias-state-error-primary, #ff6b6b)",
                        fontSize: 12,
                        lineHeight: "16px",
                        borderRadius: 6,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                        zIndex: 1000,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        border: "1px solid var(--dsw-alias-border-l2, #444)",
                        pointerEvents: "none",
                    },
                }, tooltip.error) : null
            );
        }

        // client 侧依赖：slots（注册 UI slot 的服务）
        const inject = ["slots"];

        /**
         * @param {import('@deepseek-ai/dsh-client-runtime/client').ClientContext} ctx
         */
        function apply(ctx) {
            ctx.slots.inject("settings.section", () =>
                ctx.slots.register(
                    {
                        name: "settings.section",
                        id: "model-health",
                        order: 50,
                        label: "模型健康",
                    },
                    ModelListSection
                )
            );
        }

        exports.apply = apply;
        exports.inject = inject;
        return module.exports;
    }
});
